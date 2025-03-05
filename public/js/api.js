// API配置
const CONFIG = {
  // 环境配置
  environments: {
    development: {
      apiBase: 'http://localhost:8787',
      debug: true
    },
    production: {
      apiBase: 'https://daily-recipe.fengyx91.workers.dev',
      debug: false
    }
  },
  
  // 当前环境
  get currentEnv() {
    return window.location.hostname === 'localhost' ? 'development' : 'production';
  },

  // 获取当前配置
  get current() {
    return this.environments[this.currentEnv];
  }
};

// API基础URL
const API_BASE_URL = CONFIG.current.apiBase;

// 调试信息
if (CONFIG.current.debug) {
  console.log('当前环境:', CONFIG.currentEnv);
  console.log('API配置:', CONFIG.current);
  console.log('API基础URL:', API_BASE_URL);
}

// API请求工具函数
async function fetchAPI(endpoint, options = {}) {
  const requestUrl = `${API_BASE_URL}/api${endpoint}`;
  
  if (CONFIG.current.debug) {
    console.log(`请求 API: ${requestUrl}`, { options });
  }

  try {
    const response = await fetch(requestUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || `请求失败: ${response.status}`);
    }

    const data = await response.json();
    
    if (CONFIG.current.debug) {
      console.log(`API响应 (${endpoint}):`, data);
    }

    return data;
  } catch (error) {
    console.error(`API错误 (${endpoint}):`, error);
    throw new Error(error.message || '网络请求失败，请稍后重试');
  }
}

// 登录函数
export async function login() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'demo',  // 示例用户
        password: 'demo'   // 示例密码
      })
    });
    
    if (!response.ok) {
      throw new Error('登录失败');
    }
    
    // 登录成功后，JWT token会自动保存在cookie中
    return true;
  } catch (error) {
    console.error('登录错误:', error);
    return false;
  }
}

// 获取每日推荐
export async function getDailyRecommendations() {
  console.log('获取每日推荐');
  
  try {
    // 添加时间戳避免缓存
    const timestamp = new Date().getTime();
    const response = await fetchAPI(`/recommendations?_=${timestamp}`);
    console.log('每日推荐响应:', response);
    return response;
  } catch (error) {
    console.error('获取每日推荐失败:', error);
    throw error;
  }
}

// 上传图片
export async function uploadImage(image, recipeId) {
  try {
    const formData = new FormData();
    formData.append('image', image);
    formData.append('recipeId', recipeId);

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('上传失败');
    }
    return await response.json();
  } catch (error) {
    console.error('上传错误:', error);
    throw error;
  }
}

// 获取用户作品集
export async function getUserGallery(userId) {
  if (!userId) {
    throw new Error('缺少必要参数：userId');
  }
  
  if (CONFIG.current.debug) {
    console.log(`获取用户作品集，userId: ${userId}`);
  }
  
  try {
    // 注意这里使用了精确的路径格式
    const data = await fetchAPI(`/gallery/${userId}`);
    return data || [];
  } catch (error) {
    console.error(`获取用户作品集失败 (userId=${userId}):`, error);
    // 确保返回一个空数组，避免前端出错
    throw new Error(`获取作品集失败: ${error.message}`);
  }
}

// 获取用户偏好设置
export async function getUserPreferences() {
  return fetchAPI('/user/preferences');
}

// 更新用户偏好设置
export async function updateUserPreferences(preferences) {
  return fetchAPI('/user/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences)
  });
}

// 获取历史记录
export async function getHistory(date) {
  // 如果没有提供日期，使用当前日期
  if (!date) {
    const today = new Date();
    date = today.toISOString().split('T')[0]; // 格式：YYYY-MM-DD
  }
  
  if (CONFIG.current.debug) {
    console.log(`获取历史记录，日期: ${date}`);
  }
  
  try {
    // 注意这里query参数的格式
    const data = await fetchAPI(`/history?date=${encodeURIComponent(date)}`);
    return data || { date, recipes: [] };
  } catch (error) {
    console.error(`获取历史记录失败 (date=${date}):`, error);
    // 返回一个有效的空数据结构
    throw new Error(`获取历史记录失败: ${error.message}`);
  }
}

// 健康检查函数
export async function checkHealth() {
  try {
    const startTime = new Date().getTime();
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const endTime = new Date().getTime();
    
    if (!response.ok) {
      throw new Error(`健康检查失败: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    data.responseTime = endTime - startTime;
    
    console.log('健康检查结果:', data);
    return data;
  } catch (error) {
    console.error('健康检查失败:', error);
    throw error;
  }
}

// API诊断工具函数
export async function diagnoseAPI() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: CONFIG.currentEnv,
    apiBase: API_BASE_URL,
    tests: {}
  };
  
  // 测试网络连接
  try {
    const startTime = new Date().getTime();
    const response = await fetch(API_BASE_URL, { 
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store' // 避免缓存
    });
    const endTime = new Date().getTime();
    
    let responseData = null;
    try {
      responseData = await response.json();
    } catch (e) {
      // 忽略解析错误
    }
    
    results.tests.network = {
      success: response.status < 500, // 我们认为404也是"成功"的，因为至少服务器在响应
      time: endTime - startTime,
      status: response.status,
      data: responseData
    };
  } catch (error) {
    results.tests.network = {
      success: false,
      error: error.message
    };
  }
  
  // 测试健康检查端点
  try {
    const healthUrl = `${API_BASE_URL}/api/health`;
    const startTime = new Date().getTime();
    const response = await fetch(healthUrl, {
      cache: 'no-store', // 避免缓存
      headers: {
        'Accept': 'application/json'
      }
    });
    const endTime = new Date().getTime();
    
    let healthData = null;
    try {
      healthData = await response.json();
    } catch (e) {
      // 忽略解析错误
    }
    
    results.tests.health = {
      success: response.ok,
      time: endTime - startTime,
      status: response.status,
      data: healthData
    };
  } catch (error) {
    results.tests.health = {
      success: false,
      error: error.message
    };
  }
  
  console.log('API诊断结果:', results);
  return results;
} 