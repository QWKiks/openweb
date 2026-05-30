const callList = document.getElementById("call-list");
const statsEl = document.getElementById("stats");
const filterInput = document.getElementById("filter-input");
const clearBtn = document.getElementById("clear-btn");

const MAX_CALLS = 200;
let calls = [];
let totalCalls = 0;
let totalErrors = 0;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const port = chrome.runtime.connect({ name: "devtools-panel" });

port.onMessage.addListener((msg) => {
  if (msg.type === "TOOL_CALL_EVENT") {
    addCall(msg.data);
  } else if (msg.type === "METRICS_SNAPSHOT") {
    for (const entry of msg.data.actionLog || []) {
      addCall(entry, true);
    }
  }
});

port.postMessage({ type: "GET_METRICS" });

function addCall(entry, prepend) {
  totalCalls++;
  if (entry.error) totalErrors++;

  const call = {
    name: entry.name,
    time: entry.time,
    durationMs: entry.durationMs,
    error: entry.error || null,
  };

  if (prepend) {
    calls.push(call);
  } else {
    calls.unshift(call);
  }

  

  if (calls.length > MAX_CALLS) {
    calls.length = MAX_CALLS;
    while (callList.children.length > MAX_CALLS) {
      callList.removeChild(callList.lastChild);
    }
  }

  updateStats();
  renderCall(call, prepend);
}

function renderCall(call, append) {
  const div = document.createElement("div");
  div.className = "call-entry";
  div.dataset.name = call.name.toLowerCase();

  const status = document.createElement("span");
  status.className = "call-status " + (call.error ? "error" : "ok");

  const time = document.createElement("span");
  time.className = "call-time";
  time.textContent = call.time;

  const name = document.createElement("span");
  name.className = "call-name";
  name.textContent = call.name;

  const duration = document.createElement("span");
  duration.className = "call-duration";
  duration.textContent = call.durationMs ? `${call.durationMs}ms` : "";

  div.appendChild(status);
  div.appendChild(time);
  div.appendChild(name);
  div.appendChild(duration);

  if (call.error) {
    const errorEl = document.createElement("span");
    errorEl.className = "call-error";
    errorEl.textContent = call.error;
    div.appendChild(errorEl);
  }

  if (append) {
    callList.appendChild(div);
  } else {
    callList.insertBefore(div, callList.firstChild);
  }
}

function updateStats() {
  statsEl.textContent = `${totalCalls} calls · ${totalErrors} errors`;
}

filterInput.addEventListener("input", debounce(() => {
  const f = filterInput.value.toLowerCase();
  for (const el of callList.children) {
    el.style.display = el.dataset.name.includes(f) ? "" : "none";
  }
}, 100));

clearBtn.addEventListener("click", () => {
  calls = [];
  totalCalls = 0;
  totalErrors = 0;
  callList.innerHTML = "";
  updateStats();
});
