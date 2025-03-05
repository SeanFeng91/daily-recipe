import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

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

// JWT 中间件
app.use('*', async (c, next) => {
  // 公共路径列表 - 不需要验证JWT
  const publicPaths = [
    '/api/health',
    '/api/recommendations',
    '/api/history',
    '/api/gallery',
    '/api/clear-cache', // 添加清除缓存端点到公共路径
    '/api/test-groq',
    '/api/user/preferences/*'
  ];
  
  // 检查请求路径是否在公共路径列表中，或者是否以公共路径开头
  const isPublicPath = publicPaths.some(path => 
    c.req.path === path || 
    (path.endsWith('/*') && c.req.path.startsWith(path.slice(0, -2)))
  );
  
  if (isPublicPath || c.req.path.startsWith('/api/gallery/')) {
    // 为公共路径设置默认用户
    c.set('jwtPayload', { sub: 'demo' });
    return next();
  }
  
  // 检查JWT密钥是否已配置
  if (!c.env.JWT_SECRET) {
    console.warn('JWT_SECRET未配置，跳过身份验证');
    // 无JWT密钥时，设置一个默认用户
    c.set('jwtPayload', { sub: 'demo' });
    return next();
  }
  
  try {
    const jwtMiddleware = jwt({
      secret: c.env.JWT_SECRET,
      cookie: 'auth'
    });
    return jwtMiddleware(c, next);
  } catch (error) {
    console.error('JWT验证失败:', error);
    
    // 验证失败时，设置一个默认用户以允许访问
    c.set('jwtPayload', { sub: 'demo' });
    return next();
    
    // 如果您想保持严格的身份验证，取消上面两行注释，并取消注释下面的返回语句
    /*
    return c.json({ 
      error: '身份验证失败', 
      message: '请先登录', 
      details: CONFIG.debug ? error.message : undefined 
    }, 401);
    */
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

// AI推荐API
app.get('/api/recommendations', async (c) => {
  try {
    // 从URL获取是否禁用缓存的参数
    const disableCache = c.req.query('nocache') === 'true';
    const date = new Date().toISOString().split('T')[0];
    console.log(`获取日期 ${date} 的推荐, 禁用缓存: ${disableCache}`);
    
    // 如果不禁用缓存，先尝试从KV中获取今天的推荐
    if (!disableCache) {
      const cached = await c.env.RECIPES_KV.get(`recommendations:${date}`);
      if (cached) {
        console.log(`找到缓存的推荐数据`);
        return c.json(JSON.parse(cached));
      }
    } else {
      console.log('禁用缓存，直接调用API');
    }

    // 检查是否配置了GROQ API密钥
    if (!c.env.GROQ_API_KEY) {
      console.warn('GROQ_API_KEY未配置，使用默认数据');
      
      // 使用默认数据
      const defaultRecommendations = [
        {
          "菜名": "红烧肉",
          "简短描述": "经典的中式红烧肉，肥而不腻，入口即化。",
          "所需时间": "90分钟",
          "难度级别": "中等",
          "主要食材": ["五花肉", "姜", "葱", "酱油", "冰糖"]
        },
        {
          "菜名": "宫保鸡丁",
          "简短描述": "经典川菜，鸡肉与花生的完美结合，麻辣香鲜。",
          "所需时间": "30分钟",
          "难度级别": "简单",
          "主要食材": ["鸡胸肉", "花生", "干辣椒", "葱", "姜", "蒜"]
        },
        {
          "菜名": "清蒸鱼",
          "简短描述": "保留食材原汁原味的经典蒸菜，鲜嫩可口。",
          "所需时间": "25分钟",
          "难度级别": "简单",
          "主要食材": ["鲈鱼", "姜", "葱", "酱油", "香油"]
        }
      ];
      
      // 存储到KV中
      await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(defaultRecommendations));
      
      return c.json(defaultRecommendations);
    }
    
    console.log(`使用GROQ API获取推荐 (密钥: ${c.env.GROQ_API_KEY.substring(0, 4)}...)`);
    
    // 如果有GROQ API密钥，则请求AI推荐
    const prompt = `作为一个专业的中餐厨师，请推荐3道今天适合烹饪的菜品。
    对于每道菜，请提供：
    1. 菜名
    2. 简短描述
    3. 所需时间（以分钟为单位）
    4. 难度级别（简单/中等/困难）
    5. 主要食材
    请用JSON格式返回，格式如下：
    [
      {
        "菜名": "菜品名称",
        "简短描述": "描述文本",
        "所需时间": "30分钟",
        "难度级别": "简单",
        "主要食材": ["食材1", "食材2"]
      }
    ]`;

    // 使用 try-catch 单独捕获 GROQ API 请求错误
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${c.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{
            role: "user",
            content: prompt
          }],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GROQ API请求失败: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`AI服务调用失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('GROQ API响应:', JSON.stringify(data).substring(0, 200) + '...');
      
      if (!data.choices?.[0]?.message?.content) {
        console.error('AI响应格式错误，缺少content字段:', data);
        throw new Error('AI响应格式错误');
      }

      // 格式验证和错误处理
      let recommendations;
      try {
        // 尝试解析JSON
        const content = data.choices[0].message.content;
        console.log('解析JSON:', content);
        recommendations = JSON.parse(content);
        
        // 验证数据结构
        if (!Array.isArray(recommendations)) {
          throw new Error('返回数据不是数组');
        }
        
        // 验证是否有足够的推荐
        if (recommendations.length === 0) {
          throw new Error('推荐列表为空');
        }
        
        // 验证每个推荐项的格式
        recommendations.forEach((item, index) => {
          if (!item.菜名 || !item.简短描述 || !item.所需时间 || !item.难度级别 || !Array.isArray(item.主要食材)) {
            throw new Error(`第${index+1}个推荐项缺少必要字段`);
          }
        });
      } catch (parseError) {
        console.error('解析AI响应失败:', parseError, '原始内容:', data.choices[0].message.content);
        
        // 使用默认数据
        recommendations = [
          {
            "菜名": "AI解析失败-红烧茄子",
            "简短描述": "香气扑鼻，茄子软糯，汁浓味香。",
            "所需时间": "40分钟",
            "难度级别": "简单",
            "主要食材": ["茄子", "葱", "姜", "蒜", "酱油"]
          },
          {
            "菜名": "AI解析失败-西红柿炒鸡蛋",
            "简短描述": "家常经典，酸甜可口。",
            "所需时间": "15分钟",
            "难度级别": "简单",
            "主要食材": ["西红柿", "鸡蛋", "葱", "盐", "糖"]
          }
        ];
      }
      
      // 存储到KV中
      console.log(`存储推荐到KV: recommendations:${date}`);
      await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(recommendations));

      return c.json(recommendations);
    } catch (groqError) {
      console.error('GROQ API调用失败:', groqError);
      
      // 返回默认数据
      const fallbackRecommendations = [
        {
          "菜名": "API错误-麻婆豆腐",
          "简短描述": "四川名菜，麻辣鲜香。",
          "所需时间": "30分钟",
          "难度级别": "中等",
          "主要食材": ["豆腐", "肉末", "豆瓣酱", "花椒", "辣椒"]
        },
        {
          "菜名": "API错误-糖醋排骨",
          "简短描述": "酸甜可口，色泽诱人。",
          "所需时间": "60分钟",
          "难度级别": "中等",
          "主要食材": ["排骨", "白糖", "醋", "酱油", "料酒"]
        }
      ];
      
      // 存储到KV中
      await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(fallbackRecommendations));
      
      return c.json(fallbackRecommendations);
    }
  } catch (error) {
    console.error('推荐API错误:', error);
    return c.json({ 
      error: error.message || '获取推荐失败',
      timestamp: new Date().toISOString(),
      fallbackRecommendations: [
        {
          "菜名": "服务器错误-番茄炒蛋",
          "简短描述": "家常便饭，简单美味。",
          "所需时间": "10分钟",
          "难度级别": "简单",
          "主要食材": ["番茄", "鸡蛋", "盐", "糖", "葱花"]
        }
      ]
    });
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
    
    // 如果没有找到该日期的数据，生成一些默认数据
    if (!recommendations) {
      // 根据日期生成一些伪随机数据
      const dayNumber = new Date(date).getDate() % 3; // 0, 1 或 2
      
      const defaultRecipes = [
        [
          {
            "菜名": "糖醋里脊",
            "简短描述": "外酥里嫩，酸甜可口的经典菜肴。",
            "所需时间": "45分钟",
            "难度级别": "中等",
            "主要食材": ["里脊肉", "醋", "糖", "番茄酱"]
          },
          {
            "菜名": "蒜蓉西兰花",
            "简短描述": "健康营养，口感爽脆的快手菜。",
            "所需时间": "15分钟",
            "难度级别": "简单",
            "主要食材": ["西兰花", "大蒜", "盐", "食用油"]
          }
        ],
        [
          {
            "菜名": "麻婆豆腐",
            "简短描述": "经典川菜，麻辣鲜香，下饭神器。",
            "所需时间": "30分钟",
            "难度级别": "简单",
            "主要食材": ["豆腐", "肉末", "豆瓣酱", "花椒粉"]
          },
          {
            "菜名": "蛋炒饭",
            "简短描述": "简单易做的家常菜，香气扑鼻。",
            "所需时间": "20分钟",
            "难度级别": "简单",
            "主要食材": ["米饭", "鸡蛋", "葱", "胡萝卜"]
          }
        ],
        [
          {
            "菜名": "水煮肉片",
            "简短描述": "麻辣鲜香的川菜经典，肉质鲜嫩。",
            "所需时间": "40分钟",
            "难度级别": "中等",
            "主要食材": ["肉片", "辣椒", "豆芽", "蒜苗"]
          },
          {
            "菜名": "鱼香茄子",
            "简短描述": "色香味俱全，口感丰富的传统菜品。",
            "所需时间": "35分钟",
            "难度级别": "中等",
            "主要食材": ["茄子", "肉末", "葱姜蒜", "豆瓣酱"]
          }
        ]
      ];
      
      // 将默认数据存入KV，下次可直接使用
      await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(defaultRecipes[dayNumber]));
      
      return c.json({
        date,
        recipes: defaultRecipes[dayNumber]
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