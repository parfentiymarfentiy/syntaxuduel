const authButtons = document.getElementById("authButtons");
const user = JSON.parse(localStorage.getItem("user"));

if (user && authButtons) {
  authButtons.innerHTML = `
    <span class="btn-login" style="
      background: linear-gradient(135deg, #6366f1, #a78bfa);
      color: white;
      padding: 12px 24px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 1rem;
      box-shadow: 0 8px 20px rgba(99,102,241,0.5);
    ">
      👋 ${user.name}
    </span>
    <a href="#" class="btn-register" id="logout">Выйти</a>
  `;

  document.getElementById("logout").onclick = () => {
    localStorage.removeItem("user");
    location.reload();
  };
}
