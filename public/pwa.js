(() => {
  let installEvent = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const button = document.createElement('button');
  button.className = 'install-app';
  button.textContent = '↓ 앱 설치';
  button.type = 'button';
  button.hidden = standalone();
  document.querySelector('.header-right').append(button);
  const connection = document.createElement('div');
  connection.className = 'offline-note';
  connection.setAttribute('role', 'status');
  connection.textContent = '\uC624\uD504\uB77C\uC778 \u00B7 \uC0C1\uB2F4 \uC2E0\uCCAD\uACFC AI \uAC80\uD1A0\uB294 \uC778\uD130\uB137 \uC5F0\uACB0\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.';
  document.querySelector('main').prepend(connection);
  const updateConnection = () => { connection.hidden = navigator.onLine; };
  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    button.textContent = '↓ 앱 설치';
    button.hidden = standalone();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; button.hidden = true; });
  button.addEventListener('click', async () => {
    if (installEvent) {
      const prompt = installEvent;
      installEvent = null;
      await prompt.prompt();
      await prompt.userChoice;
      return;
    }
    const dialog = document.querySelector('#detail');
    dialog.innerHTML = `<button class="close" aria-label="닫기">×</button><span class="tag">SEUM APP</span><h2>세움을 홈 화면에서 바로 열어보세요.</h2><p>설치하면 앱 아이콘으로 실행하고, 독립된 창에서 이용할 수 있습니다.</p><div class="issue-card"><h4>iPhone · iPad</h4><p>Safari에서 이 페이지를 연 뒤 공유 메뉴 → ‘홈 화면에 추가’를 선택하세요.</p></div><div class="issue-card"><h4>Android</h4><p>Chrome 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. 브라우저에 따라 표시가 다를 수 있습니다.</p></div><div class="issue-card"><h4>PC</h4><p>Chrome·Edge 주소창의 설치 아이콘 또는 브라우저 메뉴의 설치 항목을 이용하세요.</p></div><div class="notice">스토어 등록 앱이 아닌 설치형 웹앱입니다. 설치 메뉴가 보이지 않으면 기본 브라우저에서 다시 열어주세요. 기기에 저장된 자료는 브라우저 데이터를 지우면 삭제될 수 있습니다.</div>`;
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.showModal();
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        registration.update().catch(() => {});
      }).catch(error => console.warn('오프라인 준비를 완료하지 못했습니다.', error));
    });
  }
})();
