// API配置
export const CONFIG = {
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
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API错误 (${endpoint}):`, error);
    throw error;
  }
}

// 登录
export async function login() {
  try {
    // 模拟登录请求
    const response = await fetchAPI('/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'demo',
        password: 'demo'
      })
    });
    
    if (response.token) {
      // 在实际应用中，应该将token存储在cookie或localStorage中
      document.cookie = `auth=${response.token}; path=/; max-age=86400`;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('登录失败:', error);
    return false;
  }
}

// 获取每日推荐
export async function getDailyRecommendations(forceRefresh = false) {
  console.log('获取每日推荐，强制刷新:', forceRefresh);
  
  try {
    // 添加时间戳和强制刷新参数
    const queryParams = new URLSearchParams();
    queryParams.append('_t', Date.now());
    
    if (forceRefresh) {
      queryParams.append('nocache', 'true');
      console.log('添加nocache参数以强制刷新');
    }
    
    const endpoint = `/recommendations?${queryParams.toString()}`;
    console.log('请求推荐API:', endpoint);
    
    // 使用更直接的fetch来获取更多控制
    const requestUrl = `${API_BASE_URL}/api${endpoint}`;
    console.log(`发送请求到: ${requestUrl}`);
    
    const startTime = Date.now();
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    const endTime = Date.now();
    console.log(`请求耗时: ${endTime - startTime}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API返回错误状态码 ${response.status}:`, errorText);
      throw new Error(`请求失败: ${response.status} - ${errorText.substring(0, 100)}`);
    }
    
    const responseData = await response.json();
    console.log('推荐API响应:', responseData);
    
    // 验证响应是数组
    if (!Array.isArray(responseData)) {
      console.error('API响应格式错误，不是数组:', responseData);
      throw new Error('API响应格式错误: 预期数组，实际为 ' + typeof responseData);
    }
    
    return responseData;
  } catch (error) {
    console.error('获取每日推荐失败:', error);
    // 重新抛出，但提供更多上下文
    throw new Error(`获取推荐失败: ${error.message}`);
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