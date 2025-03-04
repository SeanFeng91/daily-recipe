// API基础URL
const API_BASE = '/api';

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
  return fetchAPI('/recommendations');
}

// 上传作品图片
export async function uploadImage(image, recipeId) {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('recipeId', recipeId);

  return fetchAPI('/upload', {
    method: 'POST',
    body: formData,
    headers: {} // 让浏览器自动设置Content-Type
  });
}

// 获取用户作品集
export async function getUserGallery(userId) {
  return fetchAPI(`/gallery/${userId}`);
}

// 获取用户偏好设置
export async function getUserPreferences() {
  return fetchAPI('/preferences');
}

// 更新用户偏好设置
export async function updateUserPreferences(preferences) {
  return fetchAPI('/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences)
  });
}

// 获取历史记录
export async function getHistory(date) {
  return fetchAPI(`/history?date=${date}`);
} 