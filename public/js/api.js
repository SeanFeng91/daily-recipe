// API基础URL
const API_BASE = '';

// API请求工具函数
async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.statusText}`);
  }

  return response.json();
}

// 获取每日推荐
export async function getDailyRecommendations() {
  return fetchAPI('/api/recommendations');
}

// 上传作品图片
export async function uploadImage(image, recipeId) {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('recipeId', recipeId);

  return fetchAPI('/api/upload', {
    method: 'POST',
    body: formData,
    headers: {} // 让浏览器自动设置Content-Type
  });
}

// 获取用户作品集
export async function getUserGallery(userId) {
  return fetchAPI(`/api/gallery/${userId}`);
}

// 获取用户偏好设置
export async function getUserPreferences() {
  return fetchAPI('/api/user/preferences');
}

// 更新用户偏好设置
export async function updateUserPreferences(preferences) {
  return fetchAPI('/api/user/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences)
  });
}

// 获取历史记录
export async function getHistory(date) {
  return fetchAPI(`/api/history?date=${date}`);
} 