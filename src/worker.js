import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { serveStatic } from 'hono/serve-static';

const app = new Hono();

// JWT 中间件
app.use('/api/*', jwt({
  secret: env.JWT_SECRET,
  cookie: 'auth'
}));

// 静态文件服务
app.get('/*', serveStatic({ root: './public' }));

// AI推荐API
app.get('/api/recommendations', async (c) => {
  const prompt = `作为一个专业的中餐厨师，请推荐3道今天适合烹饪的菜品。
  对于每道菜，请提供：
  1. 菜名
  2. 简短描述
  3. 所需时间
  4. 难度级别
  5. 主要食材
  请用JSON格式返回，确保包含上述所有信息。`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    const data = await response.json();
    const recommendations = JSON.parse(data.choices[0].message.content);
    
    // 存储到KV中
    const date = new Date().toISOString().split('T')[0];
    await c.env.RECIPES_KV.put(`recommendations:${date}`, JSON.stringify(recommendations));

    return c.json(recommendations);
  } catch (error) {
    return c.json({ error: '获取推荐失败' }, 500);
  }
});

// 图片上传API
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const image = formData.get('image');
    const userId = c.get('jwtPayload').sub;

    if (!image) {
      return c.json({ error: '没有上传图片' }, 400);
    }

    // 生成唯一文件名
    const filename = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    
    // 上传到R2
    await c.env.RECIPE_IMAGES.put(filename, image.stream(), {
      httpMetadata: {
        contentType: image.type,
      }
    });

    // 保存记录到KV
    const imageRecord = {
      userId,
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
app.get('/api/gallery/:userId', async (c) => {
  const userId = c.params.userId;
  const images = await c.env.RECIPES_KV.list({ prefix: `image:${userId}/` });
  
  const gallery = await Promise.all(images.keys.map(async (key) => {
    const record = await c.env.RECIPES_KV.get(key.name);
    return JSON.parse(record);
  }));

  return c.json(gallery);
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

export default {
  fetch: app.fetch
}; 