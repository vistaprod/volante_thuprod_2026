// registerServiceWorker.js
export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);

                    // Check for waiting worker
                    if (registration.waiting) {
                        showUpdateNotification(registration.waiting);
                    }

                    // Detect new worker installing
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateNotification(newWorker);
                            }
                        });
                    });
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });

        // Refresh page when new SW takes control
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }
}

function showUpdateNotification(worker) {
    const notification = document.getElementById('update-notification');
    const restartBtn = document.getElementById('restart-btn');

    if (notification && restartBtn) {
        notification.classList.remove('hidden');
        restartBtn.addEventListener('click', () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
            notification.classList.add('hidden');
        });
    }
}
