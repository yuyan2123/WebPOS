// Progress counts completed work, never elapsed time or estimated download bytes.
export function startupProgress(completed, message) {
  document.getElementById('startupProgress').value = completed;
  document.getElementById('startupMessage').textContent = message;
  document.getElementById('startupCount').textContent = `已完成 ${completed} / 4 步驟（${completed * 25}%）`;
}

const painted = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function finishStartup() {
  await painted();
  startupProgress(4, '載入完成');
  await painted();
  document.getElementById('startupStatus').hidden = true;
  document.querySelector('main').inert = false;
  document.querySelector('main').removeAttribute('aria-busy');
  document.querySelector('.app-navigation').inert = false;
  document.querySelector('.fab-cart').inert = false;
}

export function failStartup(error) {
  console.error('application_initialization_failed', error);
  document.getElementById('startupStatus').setAttribute('role', 'alert');
  document.getElementById('startupMessage').textContent = `載入失敗：${error?.message || '請檢查連線後重試'}`;
  document.querySelector('.startup-spinner').hidden = true;
  document.getElementById('startupRetry').hidden = false;
}
