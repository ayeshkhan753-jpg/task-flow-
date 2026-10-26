const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("taskflow_token") || "";
let currentUser = JSON.parse(sessionStorage.getItem("taskflow_user") || "null");
let authMode = "login", page = 1, pageSize = 8, totalPages = 0, activeStatus = "";
let toastTimer;

function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, { ...options, headers }).then(async response => {
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token) logout(false);
      throw new Error(data?.detail || "Something went wrong. Please try again.");
    }
    return data;
  });
}
function showToast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}
function escapeHTML(value="") {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function niceStatus(status) { return ({pending:"Pending",in_progress:"In progress",completed:"Completed"})[status] || status; }
function dateLabel(value) {
  try { return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(new Date(value)); }
  catch { return ""; }
}
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.auth === mode));
  $("nameWrap").classList.toggle("hidden", mode !== "register");
  $("name").required = mode === "register";
  $("authSubmit").innerHTML = mode === "login" ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("authMessage").textContent = "";
}
function renderShell() {
  const loggedIn = Boolean(token && currentUser);
  $("authPanel").classList.toggle("hidden", loggedIn);
  $("dashboard").classList.toggle("hidden", !loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    $("sidebarName").textContent = currentUser.name;
    $("sidebarEmail").textContent = currentUser.email;
    $("avatar").textContent = (currentUser.name || "U").trim().charAt(0).toUpperCase();
    $("greeting").textContent = `Welcome back, ${currentUser.name.split(" ")[0]}.`;
    loadTasks();
  } else {
    $("sidebarName").textContent = "Your account";
    $("sidebarEmail").textContent = "Sign in to continue";
    $("avatar").textContent = "U";
    $("greeting").textContent = "Make room for great work.";
  }
}
async function loadTasks() {
  const status = $("statusFilter").value || activeStatus;
  const priority = $("priorityFilter").value;
  const search = $("searchInput").value.trim();
  const params = new URLSearchParams({page, page_size:pageSize});
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (search) params.set("search", search);
  try {
    const result = await api(`/api/tasks?${params}`);
    totalPages = result.pages;
    $("pageInfo").textContent = `Page ${result.pages ? result.page : 0} of ${result.pages}`;
    $("prevPage").disabled = page <= 1;
    $("nextPage").disabled = !result.pages || page >= result.pages;
    renderTasks(result.items);
    updateStats();
    $("navTotal").textContent = $("statTotal").textContent;
  } catch (error) { showToast(error.message); }
}
async function updateStats() {
  try {
    const results = await Promise.all(["", "pending", "in_progress", "completed"].map(status => {
      const params = new URLSearchParams({page:1,page_size:1}); if(status) params.set("status",status);
      return api(`/api/tasks?${params}`);
    }));
    $("statTotal").textContent = results[0].total;
    $("statPending").textContent = results[1].total;
    $("statProgress").textContent = results[2].total;
    $("statCompleted").textContent = results[3].total;
    $("navTotal").textContent = results[0].total;
  } catch {}
}
function renderTasks(tasks) {
  const list = $("taskList");
  if (!tasks.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✳</div><h3>${$("searchInput").value.trim() ? "No matching tasks" : "A fresh page, full of possibility."}</h3><p>${$("searchInput").value.trim() ? "Try another search or change your filters." : "Add your first task and start building momentum."}</p><button class="primary-btn" id="emptyAdd">＋ Create your first task</button></div>`;
    $("emptyAdd").addEventListener("click", () => openTaskDialog());
    return;
  }
  list.innerHTML = tasks.map(task => `<article class="task-card ${task.status==="completed"?"is-done":""}">
    <button class="task-check ${task.status==="completed"?"done":""}" data-complete="${task.id}" title="${task.status==="completed"?"Mark incomplete":"Mark complete"}">${task.status==="completed"?"✓":""}</button>
    <div class="task-info"><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || "No description added.")}</p></div>
    <div class="task-meta"><span class="badge status-${task.status}">${niceStatus(task.status)}</span><span class="badge priority-${task.priority}">${task.priority[0].toUpperCase()+task.priority.slice(1)} priority</span><span class="task-date">${dateLabel(task.created_at)}</span></div>
    <div class="task-actions"><button class="icon-btn" data-edit="${task.id}" title="Edit task">✎</button><button class="icon-btn delete" data-delete="${task.id}" title="Delete task">⌫</button></div>
  </article>`).join("");
  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => editTask(Number(btn.dataset.edit))));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteTask(Number(btn.dataset.delete))));
  list.querySelectorAll("[data-complete]").forEach(btn => btn.addEventListener("click", () => toggleComplete(Number(btn.dataset.complete), btn.classList.contains("done"))));
}
async function toggleComplete(id, isDone) {
  try { await api(`/api/tasks/${id}`, {method:"PUT",body:JSON.stringify({status:isDone?"pending":"completed"})}); showToast(isDone?"Task moved to pending.":"Task completed. Nice work!"); await loadTasks(); }
  catch(error){showToast(error.message);}
}
function openTaskDialog(task=null) {
  $("taskForm").reset(); $("taskMessage").textContent = "";
  $("taskId").value = task?.id || "";
  $("dialogTitle").textContent = task ? "Edit task" : "Create a task";
  $("taskTitle").value = task?.title || "";
  $("taskDescription").value = task?.description || "";
  $("taskStatus").value = task?.status || "pending";
  $("taskPriority").value = task?.priority || "medium";
  $("saveTaskBtn").innerHTML = task ? 'Save changes <span>→</span>' : 'Save task <span>→</span>';
  $("taskDialog").showModal();
  $("taskTitle").focus();
}
async function editTask(id) {
  try { openTaskDialog(await api(`/api/tasks/${id}`)); }
  catch(error){showToast(error.message);}
}
async function deleteTask(id) {
  if (!confirm("Delete this task? This action cannot be undone.")) return;
  try { await api(`/api/tasks/${id}`, {method:"DELETE"}); showToast("Task deleted."); if(page>1 && $("taskList").children.length===1) page--; await loadTasks(); }
  catch(error){showToast(error.message);}
}
function logout(notify=true) {
  token = ""; currentUser = null;
  sessionStorage.removeItem("taskflow_token"); sessionStorage.removeItem("taskflow_user");
  renderShell();
  if(notify) showToast("You have been logged out.");
}
$("authForm").addEventListener("submit", async event => {
  event.preventDefault(); $("authMessage").textContent = "";
  const payload = {email:$("email").value.trim(),password:$("password").value};
  if(authMode==="register") payload.name = $("name").value.trim();
  $("authSubmit").disabled = true;
  try {
    const result = await api(authMode==="login"?"/api/auth/login":"/api/auth/register", {method:"POST",body:JSON.stringify(payload)});
    if(authMode==="register") {
      setAuthMode("login"); $("authMessage").style.color="#168567"; $("authMessage").textContent="Account created. You can now sign in.";
      $("password").value="";
    } else {
      token=result.access_token; currentUser=result.user;
      sessionStorage.setItem("taskflow_token",token); sessionStorage.setItem("taskflow_user",JSON.stringify(currentUser));
      renderShell(); showToast("Welcome to TaskFlow.");
    }
  } catch(error) { $("authMessage").style.color="#c0394b"; $("authMessage").textContent=error.message; }
  finally {$("authSubmit").disabled=false;}
});
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click",()=>setAuthMode(tab.dataset.auth)));
$("addTaskTop").addEventListener("click",()=> token ? openTaskDialog() : ($("email").focus(),showToast("Please sign in to create tasks.")));
$("closeDialog").addEventListener("click",()=>$("taskDialog").close());
$("cancelDialog").addEventListener("click",()=>$("taskDialog").close());
$("taskForm").addEventListener("submit",async event=>{
  event.preventDefault(); $("taskMessage").textContent="";
  const id=$("taskId").value;
  const payload={title:$("taskTitle").value.trim(),description:$("taskDescription").value.trim()||null,status:$("taskStatus").value,priority:$("taskPriority").value};
  $("saveTaskBtn").disabled=true;
  try {
    await api(id?`/api/tasks/${id}`:"/api/tasks",{method:id?"PUT":"POST",body:JSON.stringify(payload)});
    $("taskDialog").close(); showToast(id?"Task updated successfully.":"Task created successfully."); page=1; await loadTasks();
  } catch(error){$("taskMessage").textContent=error.message;}
  finally {$("saveTaskBtn").disabled=false;}
});
$("logoutBtn").addEventListener("click",()=>logout());
$("prevPage").addEventListener("click",()=>{if(page>1){page--;loadTasks();}});
$("nextPage").addEventListener("click",()=>{if(page<totalPages){page++;loadTasks();}});
let searchDebounce;
["searchInput","priorityFilter","statusFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",()=>{
  page=1; clearTimeout(searchDebounce); searchDebounce=setTimeout(loadTasks,id==="searchInput"?250:0);
}));
$("navAll").addEventListener("click",()=>{activeStatus="";$("statusFilter").value="";page=1;document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));$("navAll").classList.add("active");loadTasks();});
document.querySelectorAll("[data-status]").forEach(btn=>btn.addEventListener("click",()=>{
  activeStatus=btn.dataset.status;$("statusFilter").value=activeStatus;page=1;
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));btn.classList.add("active");loadTasks();
}));
setAuthMode("login");
renderShell();
