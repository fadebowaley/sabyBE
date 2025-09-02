// Telegram Web App initialization
let tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// App state
let appState = {
  currentStep: 1,
  totalSteps: 4,
  user: null,
  projects: [],
  selectedProject: null,
  formData: {},
  currentQuestionIndex: 0,
  answers: {},
};

// API endpoints
const API_BASE = '/api/v1/telegram';

// Initialize the app
document.addEventListener('DOMContentLoaded', function () {
  console.log('Telegram Web App initialized');
  updateStepIndicator();
});

// Navigation functions
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

function updateStepIndicator() {
  for (let i = 1; i <= 4; i++) {
    const step = document.getElementById(`step-${i}`);
    if (i < appState.currentStep) {
      step.classList.remove('active');
      step.classList.add('completed');
    } else if (i === appState.currentStep) {
      step.classList.remove('completed');
      step.classList.add('active');
    } else {
      step.classList.remove('active', 'completed');
    }
  }
}

function goBack() {
  if (appState.currentStep > 1) {
    appState.currentStep--;
    updateStepIndicator();
    showCurrentScreen();
  }
}

function showCurrentScreen() {
  switch (appState.currentStep) {
    case 1:
      showWelcome();
      break;
    case 2:
      showAuth();
      break;
    case 3:
      showProjects();
      break;
    case 4:
      showForm();
      break;
  }
}

// Welcome screen
function showWelcome() {
  appState.currentStep = 1;
  updateStepIndicator();
  showScreen('welcome-screen');
  updateHeader('Welcome', 'Get started with Halo Forms');
}

function startAuthentication() {
  appState.currentStep = 2;
  updateStepIndicator();
  showAuth();
}

// Authentication screen
function showAuth() {
  showScreen('auth-screen');
  updateHeader('Authentication', 'Verify your phone number');
  hideError('auth-error');
}

function requestPhoneNumber() {
  showLoading('Authenticating...');

  // Request phone number from Telegram
  tg.requestContact((contact) => {
    if (contact) {
      authenticateUser(contact.phone_number);
    } else {
      hideLoading();
      showError('auth-error', 'Phone number is required to continue');
    }
  });
}

async function authenticateUser(phoneNumber) {
  try {
    const response = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: phoneNumber,
        chatId: tg.initDataUnsafe?.user?.id || tg.initDataUnsafe?.chat?.id,
      }),
    });

    const data = await response.json();

    if (data.success) {
      appState.user = data.user;
      appState.currentStep = 3;
      updateStepIndicator();
      loadProjects();
    } else {
      hideLoading();
      showError('auth-error', data.message || 'Authentication failed');
    }
  } catch (error) {
    hideLoading();
    showError('auth-error', 'Network error. Please try again.');
    console.error('Authentication error:', error);
  }
}

// Project selection screen
async function loadProjects() {
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appState.user.token}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      appState.projects = data.projects;
      showProjects();
    } else {
      hideLoading();
      showError('project-error', data.message || 'Failed to load projects');
    }
  } catch (error) {
    hideLoading();
    showError('project-error', 'Network error. Please try again.');
    console.error('Load projects error:', error);
  }
}

function showProjects() {
  showScreen('project-screen');
  updateHeader('Select Project', 'Choose a project to work on');
  hideError('project-error');

  const container = document.getElementById('projects-container');
  container.innerHTML = '';

  appState.projects.forEach((project, index) => {
    const projectCard = document.createElement('div');
    projectCard.className = 'project-card';
    projectCard.onclick = () => selectProject(project);

    projectCard.innerHTML = `
            <div class="project-icon">
                <i class="fas fa-clipboard-list"></i>
            </div>
            <div class="project-name">${project.projectName}</div>
            <div class="project-description">
                ${project.description || 'Complete this form to submit your data'}
            </div>
        `;

    container.appendChild(projectCard);
  });
}

function selectProject(project) {
  appState.selectedProject = project;
  appState.currentStep = 4;
  updateStepIndicator();
  loadForm();
}

// Form filling screen
async function loadForm() {
  try {
    const response = await fetch(`${API_BASE}/form/${appState.selectedProject.projectId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appState.user.token}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      appState.formData = data.form;
      appState.currentQuestionIndex = 0;
      showForm();
      showNextQuestion();
    } else {
      showError('form-error', data.message || 'Failed to load form');
    }
  } catch (error) {
    showError('form-error', 'Network error. Please try again.');
    console.error('Load form error:', error);
  }
}

function showForm() {
  showScreen('form-screen');
  updateHeader('Form Questions', 'Answer the questions below');
  hideError('form-error');
  updateProgress();
}

function showNextQuestion() {
  const questions = appState.formData.elements || [];

  if (appState.currentQuestionIndex >= questions.length) {
    showReview();
    return;
  }

  const question = questions[appState.currentQuestionIndex];
  const container = document.getElementById('form-container');

  container.innerHTML = `
        <div class="form-field">
            <label class="form-label">${question.label || question.name}</label>
            ${generateInputField(question)}
        </div>
    `;

  updateProgress();
}

function generateInputField(question) {
  const fieldType = question.type || 'text';
  const fieldName = question.name;
  const currentValue = appState.answers[fieldName] || '';

  switch (fieldType) {
    case 'textarea':
      return `<textarea class="form-input form-textarea" name="${fieldName}" placeholder="${
        question.placeholder || ''
      }">${currentValue}</textarea>`;

    case 'select':
      const options = (question.options || [])
        .map(
          (option) =>
            `<option value="${option.value}" ${currentValue === option.value ? 'selected' : ''}>${option.label}</option>`
        )
        .join('');
      return `<select class="form-select" name="${fieldName}">${options}</select>`;

    case 'number':
      return `<input type="number" class="form-input" name="${fieldName}" value="${currentValue}" placeholder="${
        question.placeholder || ''
      }">`;

    default:
      return `<input type="text" class="form-input" name="${fieldName}" value="${currentValue}" placeholder="${
        question.placeholder || ''
      }">`;
  }
}

function nextQuestion() {
  // Save current answer
  const currentQuestion = appState.formData.elements[appState.currentQuestionIndex];
  const input = document.querySelector(`[name="${currentQuestion.name}"]`);

  if (input) {
    appState.answers[currentQuestion.name] = input.value;
  }

  appState.currentQuestionIndex++;
  showNextQuestion();
}

function updateProgress() {
  const questions = appState.formData.elements || [];
  const progress = questions.length > 0 ? (appState.currentQuestionIndex / questions.length) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${progress}%`;
}

// Review screen
function showReview() {
  showScreen('review-screen');
  updateHeader('Review Answers', 'Check your answers before submitting');

  const container = document.getElementById('review-container');
  container.innerHTML = '';

  Object.entries(appState.answers).forEach(([fieldName, value]) => {
    const question = appState.formData.elements.find((q) => q.name === fieldName);
    const label = question ? question.label : fieldName;

    const reviewItem = document.createElement('div');
    reviewItem.className = 'review-item';
    reviewItem.innerHTML = `
            <div class="review-label">${label}</div>
            <div class="review-value">${value || 'Not answered'}</div>
        `;

    container.appendChild(reviewItem);
  });
}

// Submit form
async function submitForm() {
  showLoading('Submitting form...');

  try {
    const response = await fetch(`${API_BASE}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appState.user.token}`,
      },
      body: JSON.stringify({
        projectId: appState.selectedProject.projectId,
        answers: appState.answers,
        formId: appState.formData.formId,
      }),
    });

    const data = await response.json();

    if (data.success) {
      hideLoading();
      showSuccess();
    } else {
      hideLoading();
      showError('form-error', data.message || 'Submission failed');
    }
  } catch (error) {
    hideLoading();
    showError('form-error', 'Network error. Please try again.');
    console.error('Submit error:', error);
  }
}

// Success screen
function showSuccess() {
  showScreen('success-screen');
  updateHeader('Success', 'Form submitted successfully');
}

function startNewForm() {
  // Reset app state
  appState = {
    currentStep: 1,
    totalSteps: 4,
    user: appState.user, // Keep user authenticated
    projects: [],
    selectedProject: null,
    formData: {},
    currentQuestionIndex: 0,
    answers: {},
  };

  updateStepIndicator();
  showWelcome();
}

function closeApp() {
  tg.close();
}

// Utility functions
function showLoading(text) {
  document.getElementById('loading-text').textContent = text;
  showScreen('loading-screen');
}

function hideLoading() {
  // This will be handled by the next screen transition
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  errorElement.textContent = message;
  errorElement.classList.remove('hidden');
}

function hideError(elementId) {
  document.getElementById(elementId).classList.add('hidden');
}

function updateHeader(title, subtitle) {
  document.getElementById('header-title').textContent = title;
  document.getElementById('header-subtitle').textContent = subtitle;

  // Show/hide back button
  const backBtn = document.querySelector('.back-btn');
  backBtn.style.display = appState.currentStep > 1 ? 'block' : 'none';
}

// Handle Telegram Web App events
tg.onEvent('viewportChanged', function () {
  // Handle viewport changes if needed
});

tg.onEvent('themeChanged', function () {
  // Handle theme changes if needed
});

// Error handling
window.addEventListener('error', function (e) {
  console.error('Web App Error:', e.error);
  showError('form-error', 'An unexpected error occurred. Please try again.');
});

// Export functions for global access
window.telegramWebApp = {
  showWelcome,
  startAuthentication,
  showAuth,
  showProjects,
  showForm,
  showReview,
  submitForm,
  showSuccess,
  startNewForm,
  closeApp,
  goBack,
};
