// API基础URL
const API_BASE_URL = '';

// API请求工具函数
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || `请求失败: ${response.status}`);
    }

    return response.json();
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
  try {
    const response = await fetch(`${API_BASE_URL}/api/recommendations`);
    if (!response.ok) {
      throw new Error('获取推荐失败');
    }
    return await response.json();
  } catch (error) {
    console.error('获取推荐错误:', error);
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
  return fetchAPI(`/gallery/${userId}`);
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
export async function getHistory(date = new Date().toISOString().split('T')[0]) {
  return fetchAPI(`/history?date=${date}`);
}

// 健康检查函数
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return await response.json();
  } catch (error) {
    console.error('健康检查失败:', error);
    throw error;
  }
} 