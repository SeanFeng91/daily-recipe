import {
  getDailyRecommendations,
  uploadImage,
  getUserGallery,
  getUserPreferences,
  updateUserPreferences
} from './api.js';

// 加载每日推荐
async function loadDailyRecommendations() {
  try {
    const recommendations = await getDailyRecommendations();
    const recipesGrid = document.querySelector('.recipes-grid');
    
    recipesGrid.innerHTML = recommendations.map(recipe => `
      <div class="recipe-card">
        <img src="${recipe.image || 'https://via.placeholder.com/300x200'}" alt="${recipe.name}" class="recipe-image">
        <div class="recipe-content">
          <h2 class="recipe-title">${recipe.name}</h2>
          <p>${recipe.description}</p>
          <div class="recipe-info">
            <div class="recipe-stats">
              <span class="stat"><i class="fas fa-clock"></i> ${recipe.time}</span>
              <span class="stat"><i class="fas fa-fire"></i> ${recipe.difficulty}</span>
            </div>
            <button class="action-button" onclick="showRecipeDetail('${recipe.id}')">查看详情</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载推荐失败:', error);
    // 显示错误提示
  }
}

// 处理图片上传
async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await uploadImage(file, currentRecipeId);
    
    // 更新预览
    const preview = document.querySelector('.upload-preview');
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    
    // 显示成功消息
    showMessage('上传成功！');
  } catch (error) {
    console.error('上传失败:', error);
    showMessage('上传失败，请重试', 'error');
  }
}

// 加载用户作品集
async function loadUserGallery() {
  try {
    const userId = getCurrentUserId(); // 获取当前用户ID的函数
    const gallery = await getUserGallery(userId);
    
    const galleryGrid = document.querySelector('.gallery-grid');
    galleryGrid.innerHTML = gallery.map(item => `
      <div class="gallery-item">
        <img src="${item.imageUrl}" alt="${item.recipeName}" class="gallery-image">
        <div class="gallery-content">
          <div class="gallery-date">${formatDate(item.timestamp)}</div>
          <h3 class="gallery-recipe-title">${item.recipeName}</h3>
          <div class="gallery-stats">
            <span class="stat">
              <i class="fas fa-heart"></i>
              ${item.likes}
            </span>
            <span class="stat">
              <i class="fas fa-comment"></i>
              ${item.comments}
            </span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载作品集失败:', error);
  }
}

// 加载用户偏好设置
async function loadUserPreferences() {
  try {
    const preferences = await getUserPreferences();
    
    // 更新UI
    Object.entries(preferences).forEach(([key, value]) => {
      const toggle = document.querySelector(`#preference-${key}`);
      if (toggle) {
        toggle.checked = value;
      }
    });
  } catch (error) {
    console.error('加载偏好设置失败:', error);
  }
}

// 保存用户偏好设置
async function saveUserPreferences(event) {
  event.preventDefault();
  
  const form = event.target;
  const preferences = {
    dailyPush: form.querySelector('#preference-dailyPush').checked,
    nutrition: form.querySelector('#preference-nutrition').checked,
    difficulty: form.querySelector('#preference-difficulty').checked,
    ingredients: form.querySelector('#preference-ingredients').checked
  };
  
  try {
    await updateUserPreferences(preferences);
    showMessage('设置已保存');
  } catch (error) {
    console.error('保存设置失败:', error);
    showMessage('保存失败，请重试', 'error');
  }
}

// 工具函数：显示消息提示
function showMessage(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// 工具函数：格式化日期
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 根据当前页面加载相应功能
  const path = window.location.pathname;
  
  if (path === '/' || path === '/index.html') {
    loadDailyRecommendations();
  } else if (path === '/gallery.html') {
    loadUserGallery();
    
    // 设置图片上传处理
    const uploadInput = document.querySelector('.upload-button');
    uploadInput.addEventListener('change', handleImageUpload);
  } else if (path === '/profile.html') {
    loadUserPreferences();
    
    // 设置表单提交处理
    const preferencesForm = document.querySelector('.preferences-form');
    preferencesForm.addEventListener('submit', saveUserPreferences);
  }
}); 