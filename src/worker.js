import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { cors } from 'hono/cors';

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
  console.log('Headers:', JSON.stringify(c.req.headers));
  try {
    await next();
  } catch (err) {
    console.error(`[错误] ${c.req.method} ${c.req.url}:`, err);
    return c.json({ error: '服务器内部错误', details: err.message }, 500);
  }
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
  // 排除登录接口
  if (c.req.path === '/api/login') {
    return next();
  }

  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    cookie: 'auth'
  });
  return jwtMiddleware(c, next);
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
    
    // 这里简单返回所有作品，真实应用中应该根据userId过滤
    const images = await c.env.RECIPES_KV.list({ prefix: `image:` });
    
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
  const userId = c.get('jwtPayload').sub;
  const preferences = await c.env.RECIPES_KV.get(`preferences:${userId}`);
  return c.json(preferences ? JSON.parse(preferences) : {});
});

app.put('/api/user/preferences', async (c) => {
  const userId = c.get('jwtPayload').sub;
  const preferences = await c.req.json();
  await c.env.RECIPES_KV.put(`preferences:${userId}`, JSON.stringify(preferences));
  return c.json({ success: true });
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
    // 测试KV连接
    const testKey = 'health-check';
    await c.env.RECIPES_KV.put(testKey, 'ok');
    const testValue = await c.env.RECIPES_KV.get(testKey);
    await c.env.RECIPES_KV.delete(testKey);

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      kv: testValue === 'ok' ? 'connected' : 'error',
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

export default app; 