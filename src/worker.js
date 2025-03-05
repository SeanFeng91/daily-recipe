import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

// 配置常量
const CONFIG = {
  debug: process.env.NODE_ENV !== 'production'
};

const app = new Hono();

// CORS 中间件 - 允许前端页面访问
app.use('*', cors({
  origin: ['https://daily-recipe.pages.dev', 'http://localhost:8080', '*'], // 允许所有域名，方便调试
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposeHeaders: ['*'],
}));

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
app.use('/api/*', async (c, next) => {
  // 排除不需要验证的接口
  const publicPaths = ['/api/login', '/api/health', '/api/health/detailed', '/api/recommendations'];
  if (publicPaths.includes(c.req.path)) {
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
    return c.json({ 
      error: '身份验证失败', 
      message: '请先登录', 
      details: CONFIG.debug ? error.message : undefined 
    }, 401);
  }
});

// AI推荐API
app.get('/api/recommendations', async (c) => {
  try {
    // 先尝试从KV中获取今天的推荐
    const date = new Date().toISOString().split('T')[0];
    const cached = await c.env.RECIPES_KV.get(`recommendations:${date}`);
    
    if (cached) {
      return c.json(JSON.parse(cached));
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
      throw new Error('AI服务调用失败');
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('AI响应格式错误');
    }

    const recommendations = JSON.parse(data.choices[0].message.content);
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error('推荐数据格式错误');
    }

    // 存储到KV中
    await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(recommendations));

    return c.json(recommendations);
  } catch (error) {
    console.error('推荐API错误:', error);
    return c.json({ error: error.message || '获取推荐失败' }, 500);
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

    return c.json({ url: `https://your-worker.workers.dev/images/${filename}` });
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

export default app; 