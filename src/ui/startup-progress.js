// Count only steps that actually need extra display time. Unused time from a
// slow step never subsidizes the average of the steps that trigger this limit.
let limitedSteps = 0;
let limitedMinimumTotal = 0;
let displayedStep = 0;
let displayedAt = 0;

async function waitForMinimumDisplay() {
  if (!displayedStep) return;
  const elapsed = performance.now() - displayedAt;
  const upper = Math.min(600, 450 * (limitedSteps + 1) - limitedMinimumTotal);
  const minimum = 300 + Math.random() * (upper - 300);
  const remaining = minimum - elapsed;
  if (remaining <= 0) return;
  limitedSteps++;
  limitedMinimumTotal += minimum;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}

// Only advance after real work completes; time can delay progress, never advance it.
export async function startupProgress(completed, message) {
  await waitForMinimumDisplay();
  document.getElementById('startupProgress').value = completed;
  document.getElementById('startupMessage').textContent = message;
  document.getElementById('startupCount').textContent = `已完成 ${completed} / 4 步驟（${completed * 25}%）`;
  displayedStep = completed;
  displayedAt = performance.now();
}

const painted = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function finishStartup() {
  await painted();
  await startupProgress(4, '載入完成');
  await painted();
  await waitForMinimumDisplay();
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
