document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('authForm');
    const toggleMode = document.getElementById('toggleMode');
    const submitBtn = document.getElementById('submitBtn');
    let isRegisterMode = false;

    if (toggleMode) {
        toggleMode.addEventListener('click', (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            const cardTitle = document.querySelector('.monster-card h2');
            if (isRegisterMode) {
                cardTitle.textContent = 'Initialize Account';
                submitBtn.textContent = 'Register & Initialize';
                toggleMode.textContent = 'Back to Login';
            } else {
                cardTitle.textContent = 'Monster Mode On';
                submitBtn.textContent = 'Enter Tracker Portal';
                toggleMode.textContent = 'Initialize Account';
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorMessage');

            const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    errorDiv.textContent = data.error;
                    errorDiv.classList.remove('hidden');
                } else {
                    window.location.href = '/dashboard.html';
                }
            } catch (err) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.classList.remove('hidden');
            }
        });
    }
});