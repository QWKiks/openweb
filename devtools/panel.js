/**
 * OpenWeb DevTools Panel Script
 * Listens for tool call events from the background service worker
 * and displays them in real time.
 */

const callList = document.getElementById("call-list");
const statsEl = document.getElementById("stats");
const filterInput = document.getElementById("filter-input");
const clearBtn = document.getElementById("clear-btn");

let calls = [];
let totalCalls = 0;
let totalErrors = 0;
let filterText = "";

// Connect to background service worker for real-time updates
const port = chrome.runtime.connect({ name: "devtools-panel" });

port.onMessage.addListener((msg) => {
  if (msg.type === "TOOL_CALL_EVENT") {
    addCall(msg.data);
  } else if (msg.type === "METRICS_SNAPSHOT") {
    // Initial load of recent calls
    for (const entry of msg.data.actionLog || []) {
      addCall(entry, true);
    }
  }
});

// Request initial metrics
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

  updateStats();
  renderCall(call, prepend);
}

function renderCall(call, append) {
  if (filterText && !call.name.toLowerCase().includes(filterText)) return;

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

function rerender() {
  callList.innerHTML = "";
  for (const call of calls) {
    renderCall(call, true);
  }
}

// Filter
filterInput.addEventListener("input", () => {
  filterText = filterInput.value.toLowerCase();
  rerender();
});

// Clear
clearBtn.addEventListener("click", () => {
  calls = [];
  totalCalls = 0;
  totalErrors = 0;
  callList.innerHTML = "";
  updateStats();
});
