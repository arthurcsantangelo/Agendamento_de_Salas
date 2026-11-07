const loginForm = document.getElementById('loginForm');
const nameGroup = document.getElementById('nameGroup');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const confirmPasswordInput = document.getElementById('confirmPassword');
const submitButton = document.getElementById('submitBtn');
const toggleModeButton = document.getElementById('toggleModeBtn');
const modePrompt = document.getElementById('modePrompt');
const recoveryLink = document.getElementById('recoveryLink');
const statusMessage = document.getElementById('loginValidationMessage');
const inputGroups = [
    nameGroup,
    emailInput.closest('.input-group'),
    passwordInput.closest('.input-group'),
    confirmPasswordGroup
];

let isRegisterMode = false;

function showMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.classList.remove('visible', 'form-error', 'form-message');
    statusMessage.classList.add(type, 'visible');
}

function clearMessage() {
    statusMessage.textContent = '';
    statusMessage.classList.remove('visible', 'form-error', 'form-message');
}

function setRegisterMode(registerMode) {
    isRegisterMode = registerMode;
    nameGroup.hidden = !registerMode;
    nameInput.required = registerMode;
    confirmPasswordGroup.hidden = !registerMode;
    confirmPasswordInput.required = registerMode;
    passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
    passwordInput.minLength = registerMode ? 12 : 0;
    submitButton.textContent = registerMode ? 'Criar conta' : 'Entrar';
    modePrompt.textContent = registerMode
        ? 'Já tem uma conta?'
        : 'Ainda não tem uma conta?';
    toggleModeButton.textContent = registerMode ? 'Entrar' : 'Criar conta';
    toggleModeButton.setAttribute('aria-expanded', String(registerMode));
    recoveryLink.hidden = registerMode;
    inputGroups.forEach((group) => group.classList.remove('error'));
    loginForm.reset();
    clearMessage();
}

toggleModeButton.addEventListener('click', () => {
    setRegisterMode(!isRegisterMode);
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const emailIsValid = emailInput.value.trim() && emailInput.validity.valid;
    const passwordIsValid = passwordInput.value.length > 0
        && (!isRegisterMode || (
            passwordInput.value.length >= 12
            && passwordInput.value.length <= 128
        ));

    emailInput.closest('.input-group').classList.toggle('error', !emailIsValid);
    passwordInput.closest('.input-group').classList.toggle('error', !passwordIsValid);

    if (isRegisterMode) {
        const nameIsValid = nameInput.value.trim().length > 0
            && nameInput.value.trim().length <= 160;
        const confirmationIsValid = confirmPasswordInput.value === passwordInput.value;
        nameGroup.classList.toggle('error', !nameIsValid);
        confirmPasswordGroup.classList.toggle('error', !confirmationIsValid);

        if (!nameIsValid || !emailIsValid || !passwordIsValid || !confirmationIsValid) {
            showMessage(
                'Informe nome e e-mail válidos, uma senha de 12 a 128 caracteres e confirme a senha.',
                'form-error'
            );
            return;
        }
    } else if (!emailIsValid || !passwordIsValid) {
        showMessage('Informe um e-mail válido e sua senha.', 'form-error');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = isRegisterMode ? 'Criando conta...' : 'Entrando...';

    try {
        if (isRegisterMode) {
            const result = await window.reserveMeApi.request('/auth/register', {
                method: 'POST',
                body: {
                    nome: nameInput.value.trim(),
                    email: emailInput.value.trim(),
                    password: passwordInput.value
                }
            });

            const registeredEmail = result.user.email;
            setRegisterMode(false);
            emailInput.value = registeredEmail;
            showMessage('Conta criada. Agora entre com seu e-mail e senha.', 'form-message');
            passwordInput.focus();
            return;
        }

        const result = await window.reserveMeApi.request('/auth/login', {
            method: 'POST',
            body: {
                email: emailInput.value.trim(),
                password: passwordInput.value
            }
        });

        sessionStorage.setItem('reserveMeToken', result.token);
        sessionStorage.setItem('reserveMeUser', JSON.stringify(result.user));
        showMessage(`Login realizado. Olá, ${result.user.nome}!`, 'form-message');
    } catch (error) {
        showMessage(error.message, 'form-error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = isRegisterMode ? 'Criar conta' : 'Entrar';
    }
});

[nameInput, emailInput, passwordInput, confirmPasswordInput].forEach((input) => {
    input.addEventListener('input', () => {
        input.closest('.input-group').classList.remove('error');
        clearMessage();
    });
});
