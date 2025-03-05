import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';
import * as jose from 'jose';

// 配置常量
const CONFIG = {
  debug: process.env.NODE_ENV !== 'production'
};

const app = new Hono();

// 调整CORS配置，允许Pages站点访问
app.use(cors({
  origin: ['https://daily-recipe.pages.dev', 'http://localhost:8080', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24小时
}));

// 可选的额外CORS处理中间件
app.options('*', (c) => {
  // 处理预检请求
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': c.req.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
});

// 添加日志中间件
app.use('*', async (c, next) => {
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
  try {
    await next();
  } catch (err) {
    console.error(`[错误] ${c.req.method} ${c.req.url}:`, err);
    return c.json({ error: '服务器内部错误', details: err.message }, 500);
  }
});

// 根路径处理 - 返回API信息
app.get('/', (c) => {
  return c.json({
    name: '每日食谱 API',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      '/api/health',
      '/api/recommendations',
      '/api/history',
      '/api/gallery',
      '/api/user/preferences'
    ]
  });
});

// 登录API
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json();
  
  // 这里简单演示，实际应该查询数据库验证用户
  if (username === 'demo' && password === 'demo') {
    // 创建JWT token
    const token = await jwt.sign({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24小时过期
    }, c.env.JWT_SECRET);

    // 设置cookie
    c.cookie('auth', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24 // 24小时
    });

    return c.json({ success: true });
  }

  return c.json({ error: '用户名或密码错误' }, 401);
});

// JWT 中间件 - 验证用户身份
app.use('*', async (c, next) => {
  // 公共路径列表 - 不需要验证JWT
  const publicPaths = [
    '/api/health',
    '/api/recommendations',
    '/api/history',
    '/api/gallery',
    '/api/clear-cache',
    '/api/test-groq',
    '/test-groq.html',
    '/js/api.js',
    '/css/style.css',
    '/',
    '/api/user/preferences/*'
  ];
  
  // 检查当前请求路径
  const path = new URL(c.req.url).pathname;
  
  // 允许静态文件直接通过
  if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.png') || path.endsWith('.jpg')) {
    console.log(`静态文件访问: ${path}`);
    return next();
  }
  
  // 检查是否是公共路径
  if (publicPaths.some(publicPath => path === publicPath || path.startsWith(publicPath))) {
    console.log(`公共API访问: ${path}`);
    return next();
  }
  
  // 检查是否有JWT密钥配置
  if (!c.env.JWT_SECRET) {
    console.warn('JWT_SECRET未配置，跳过验证');
    // 设置默认用户信息
    c.set('jwtPayload', { sub: 'demo-user', role: 'user' });
    return next();
  }

  // 获取Authorization头部
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`JWT验证失败: 未提供Authorization头部 - ${path}`);
    return c.json({ 
      error: '未授权访问', 
      message: '请提供有效的访问令牌',
      path: path
    }, 401);
  }

  // 提取JWT令牌
  const token = authHeader.substring(7);
  
  try {
    // 验证JWT
    const payload = await jose.jwtVerify(token, new TextEncoder().encode(c.env.JWT_SECRET));
    console.log(`JWT验证成功: ${payload.payload.sub}`);
    c.set('jwtPayload', payload.payload);
    return next();
  } catch (error) {
    console.error(`JWT验证错误: ${error.message}`);
    return c.json({
      error: '身份验证失败',
      message: error.message,
      path: path
    }, 401);
  }
});

// 清除缓存API - 方便强制刷新
app.get('/api/clear-cache', async (c) => {
  try {
    // 获取当前日期作为键
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `recommendations_${today}`;
    
    // 检查KV存储是否可用
    if (!c.env.RECIPES_KV) {
      console.log('缓存清除失败: KV存储未配置');
      return c.json({
        status: 'error',
        message: 'KV存储未配置，无法清除缓存',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    // 删除缓存
    await c.env.RECIPES_KV.delete(cacheKey);
    console.log(`已清除缓存: ${cacheKey}`);
    
    return c.json({
      status: 'success',
      message: `已清除${today}的推荐缓存`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('清除缓存错误:', error);
    return c.json({
      status: 'error',
      message: `清除缓存失败: ${error.message}`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
});

// 获取推荐 API
app.get('/api/recommendations', async (c) => {
  console.log('开始处理推荐请求');
  
  const GROQ_API_KEY = c.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error('GROQ API密钥未配置');
    return c.json({ error: 'GROQ API密钥未配置，无法获取推荐' }, 500);
  }

  // 获取查询参数中的偏好
  const preferences = c.req.query('preferences') || '';
  console.log('接收到的偏好:', preferences);

  try {
    console.log('准备调用GROQ API');
    let prompt = `作为一个中餐菜谱推荐系统，请推荐2道今天适合做的菜。`;
    
    // 添加用户偏好到提示词
    if (preferences) {
      prompt += ` 请考虑以下偏好: ${preferences}。`;
    }
    
    prompt += ` 请提供详细的菜品信息，包括烹饪步骤和食材数量。请严格按照以下JSON数组格式返回：
[
  {
    "菜名": "示例菜名1",
    "简短描述": "示例描述1",
    "所需时间": "30分钟",
    "难度级别": "简单",
    "主要食材": ["食材1", "食材2"],
    "详细食材": [
      {"名称": "食材1", "数量": "100克"},
      {"名称": "食材2", "数量": "2勺"}
    ],
    "烹饪步骤": [
      "第一步: 准备食材...",
      "第二步: 开始烹饪...",
      "第三步: 装盘即可"
    ],
    "小贴士": "烹饪时的注意事项或技巧"
  },
  {
    "菜名": "示例菜名2",
    "简短描述": "示例描述2",
    "所需时间": "45分钟",
    "难度级别": "中等",
    "主要食材": ["食材1", "食材2"],
    "详细食材": [
      {"名称": "食材1", "数量": "200克"},
      {"名称": "食材2", "数量": "3个"}
    ],
    "烹饪步骤": [
      "第一步: 准备食材...",
      "第二步: 开始烹饪...",
      "第三步: 装盘即可"
    ],
    "小贴士": "烹饪时的注意事项或技巧"
  }
]`;
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-r1-distill-llama-70b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 10000
      })
    });

    console.log('GROQ API响应状态:', response.status);
    const data = await response.json();
    console.log('GROQ API响应数据:', JSON.stringify(data));

    if (!response.ok) {
      throw new Error(`GROQ API请求失败: ${response.status} ${JSON.stringify(data)}`);
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('GROQ API返回的数据格式不正确');
    }

    let recommendations;
    try {
      recommendations = JSON.parse(data.choices[0].message.content);
      console.log('解析后的推荐数据:', JSON.stringify(recommendations));
      
      // 验证数据格式
      if (!Array.isArray(recommendations)) {
        console.error('API返回的不是数组格式:', recommendations);
        throw new Error('API响应格式错误: 预期数组，实际为 ' + typeof recommendations);
      }
      
      // 验证每个推荐项的基本格式
      recommendations.forEach((item, index) => {
        if (!item.菜名 || !item.简短描述 || !item.所需时间 || !item.难度级别 || !Array.isArray(item.主要食材)) {
          throw new Error(`第${index + 1}个推荐项格式不正确`);
        }
        
        // 如果缺少详细信息，添加默认值
        if (!Array.isArray(item.详细食材)) {
          item.详细食材 = item.主要食材.map(材料 => ({ 名称: 材料, 数量: "适量" }));
        }
        
        if (!Array.isArray(item.烹饪步骤)) {
          item.烹饪步骤 = ["准备食材", "按照个人口味烹饪", "装盘即可"];
        }
        
        if (!item.小贴士) {
          item.小贴士 = "根据个人口味调整调料用量";
        }
      });
      
      // 确保只返回两个推荐
      if (recommendations.length > 2) {
        recommendations = recommendations.slice(0, 2);
      }
      
    } catch (e) {
      console.error('数据格式验证失败:', e);
      throw new Error(`数据格式验证失败: ${e.message}`);
    }

    // 保存到KV存储
    const today = new Date().toISOString().split('T')[0];
    await c.env.RECIPES_KV.put(`recommendations:${today}`, JSON.stringify(recommendations));

    return c.json(recommendations);
  } catch (error) {
    console.error('获取推荐时发生错误:', error);
    return c.json({ error: `获取推荐失败: ${error.message}` }, 500);
  }
});

// 图片上传API
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const image = formData.get('image');

    if (!image) {
      return c.json({ error: '没有上传图片' }, 400);
    }

    // 生成唯一文件名
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    
    // 上传到R2
    await c.env.RECIPE_IMAGES.put(filename, image.stream(), {
      httpMetadata: {
        contentType: image.type,
      }
    });

    // 保存记录到KV
    const imageRecord = {
      filename,
      recipeId: formData.get('recipeId'),
      timestamp: Date.now()
    };
    await c.env.RECIPES_KV.put(`image:${filename}`, JSON.stringify(imageRecord));

    return c.json({ url: `https://daily-recipe.fengyx91.workers.dev/images/${filename}` });
  } catch (error) {
    return c.json({ error: '上传失败' }, 500);
  }
});

// 获取用户作品API
app.get('/api/gallery', async (c) => {
  try {
    const images = await c.env.RECIPES_KV.list({ prefix: `image:` });
    
    const gallery = await Promise.all(images.keys.map(async (key) => {
      const record = await c.env.RECIPES_KV.get(key.name);
      return JSON.parse(record);
    }));

    return c.json(gallery);
  } catch (error) {
    console.error('获取作品集失败:', error);
    return c.json({ error: '获取作品失败' }, 500);
  }
});

// 获取特定用户的作品API
app.get('/api/gallery/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    console.log(`获取用户作品，userId: ${userId}`);
    
    // 检查是否有任何图像记录
    const images = await c.env.RECIPES_KV.list({ prefix: `image:` });
    
    // 如果没有图像记录，返回默认数据
    if (images.keys.length === 0) {
      return c.json([
        {
          recipeName: "香辣小龙虾",
          imageUrl: "https://via.placeholder.com/300x200?text=小龙虾",
          timestamp: new Date().getTime() - 86400000 // 昨天
        },
        {
          recipeName: "宫保鸡丁",
          imageUrl: "https://via.placeholder.com/300x200?text=宫保鸡丁",
          timestamp: new Date().getTime() - 172800000 // 前天
        }
      ]);
    }
    
    // 否则返回实际数据
    const gallery = await Promise.all(images.keys.map(async (key) => {
      const record = await c.env.RECIPES_KV.get(key.name);
      return JSON.parse(record);
    }));

    return c.json(gallery);
  } catch (error) {
    console.error('获取用户作品失败:', error, '用户ID:', c.req.param('userId'));
    return c.json({ error: '获取作品失败' }, 500);
  }
});

// 用户配置API
app.get('/api/user/preferences', async (c) => {
  try {
    const userId = c.get('jwtPayload')?.sub || 'demo';
    const preferences = await c.env.RECIPES_KV.get(`preferences:${userId}`);
    
    // 如果没有保存的偏好，返回默认值
    if (!preferences) {
      return c.json({
        dietType: 'all',
        difficulty: 'medium'
      });
    }
    
    return c.json(JSON.parse(preferences));
  } catch (error) {
    console.error('获取用户偏好失败:', error);
    return c.json({ error: '获取偏好失败' }, 500);
  }
});

app.put('/api/user/preferences', async (c) => {
  try {
    const userId = c.get('jwtPayload')?.sub || 'demo';
    const preferences = await c.req.json();
    await c.env.RECIPES_KV.put(`preferences:${userId}`, JSON.stringify(preferences));
    return c.json({ success: true });
  } catch (error) {
    console.error('更新用户偏好失败:', error);
    return c.json({ error: '更新偏好失败' }, 500);
  }
});

// 获取历史记录API
app.get('/api/history', async (c) => {
  try {
    const date = c.req.query('date');
    if (!date) {
      return c.json({ error: '日期参数必填' }, 400);
    }

    // 从KV中获取指定日期的推荐
    const recommendations = await c.env.RECIPES_KV.get(`recommendations:${date}`);
    
    // 如果没有找到该日期的数据，返回空数组
    if (!recommendations) {
      return c.json({
        date,
        recipes: []
      });
    }

    try {
      const parsedRecipes = JSON.parse(recommendations);
      return c.json({
        date,
        recipes: Array.isArray(parsedRecipes) ? parsedRecipes : []
      });
    } catch (parseError) {
      console.error('解析历史数据失败:', parseError);
      return c.json({
        date,
        recipes: []
      });
    }
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return c.json({ error: '获取历史记录失败', details: error.message }, 500);
  }
});

// 健康检查API
app.get('/api/health', async (c) => {
  try {
    // 简化健康检查，不执行可能失败的KV操作
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        hasJwtSecret: !!c.env.JWT_SECRET,
        hasGroqKey: !!c.env.GROQ_API_KEY,
        hasKv: !!c.env.RECIPES_KV,
        hasR2: !!c.env.RECIPE_IMAGES
      }
    });
  } catch (error) {
    console.error('健康检查失败:', error);
    return c.json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// 添加详细健康检查API，仅在必要时使用
app.get('/api/health/detailed', async (c) => {
  try {
    // 测试KV连接
    let kvStatus = 'unknown';
    try {
      const testKey = 'health-check';
      await c.env.RECIPES_KV.put(testKey, 'ok');
      const testValue = await c.env.RECIPES_KV.get(testKey);
      await c.env.RECIPES_KV.delete(testKey);
      kvStatus = testValue === 'ok' ? 'connected' : 'error';
    } catch (kvError) {
      kvStatus = `error: ${kvError.message}`;
    }

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      kv: kvStatus,
      env: {
        hasJwtSecret: !!c.env.JWT_SECRET,
        hasGroqKey: !!c.env.GROQ_API_KEY,
        hasKv: !!c.env.RECIPES_KV,
        hasR2: !!c.env.RECIPE_IMAGES
      }
    });
  } catch (error) {
    console.error('详细健康检查失败:', error);
    return c.json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// 添加测试GROQ API的端点
app.post('/api/test-groq', async (c) => {
  const { prompt } = await c.req.json();
  
  // 记录请求
  console.log(`收到GROQ测试请求: ${prompt?.substring(0, 50)}...`);
  
  // 检查GROQ API密钥
  const GROQ_API_KEY = c.env.GROQ_API_KEY;
  
  if (!GROQ_API_KEY) {
    console.log('测试失败: 未设置GROQ API密钥');
    return c.json({
      error: 'GROQ API密钥未配置',
      status: 'failed',
      timestamp: new Date().toISOString()
    }, { status: 400 });
  }
  
  try {
    // 发送请求到GROQ API
    const startTime = Date.now();
    
    // 限制生成内容的数量，并确保是中文回复
    const systemPrompt = "你是一个厨师AI助手，专长于提供中文食谱和烹饪建议。请提供详细的食谱，包括材料清单和步骤说明。回复必须是中文。";
    
    // 准备请求体
    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt || "请给我一个简单的食谱" }
      ],
      model: "llama-3.1-8b-chat",
      max_tokens: 1024
    };
    
    // 发送请求到GROQ API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const endTime = Date.now();
    console.log(`GROQ API响应时间: ${endTime - startTime}ms`);
    
    // 检查响应
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GROQ API错误: ${response.status} - ${errorText}`);
      return c.json({
        error: `GROQ API返回错误: ${response.status}`,
        details: errorText,
        status: 'failed',
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }
    
    // 解析响应
    const responseData = await response.json();
    console.log(`成功获取GROQ响应: ${JSON.stringify(responseData).substring(0, 100)}...`);
    
    // 返回结果，包括执行时间和响应
    return c.json({
      status: 'success',
      execution_time_ms: endTime - startTime,
      timestamp: new Date().toISOString(),
      prompt: prompt,
      response: responseData
    });
  } catch (error) {
    console.error(`GROQ测试执行错误: ${error.message}`);
    return c.json({
      error: `执行出错: ${error.message}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
});

export default app; 