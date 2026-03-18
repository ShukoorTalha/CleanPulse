import './style.css';
import { GetStatus, AnalyzeDisk, RunAction } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

// Navigation Setup
const navLinks = document.querySelectorAll('.nav-links li');
const views = document.querySelectorAll('.view');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        // Toggle Active Link
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Show corresponding View
        const targetView = link.getAttribute('data-view');
        switchView(targetView);
    });
});

window.switchView = function(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    
    // Update nav if triggered programmatically
    navLinks.forEach(l => {
        if (l.getAttribute('data-view') === viewId) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });

    if (viewId === 'dashboard') loadStatus();
};

// Utilities for Data Formatting
function bytesToGB(bytes) {
    if (!bytes) return "0 GB";
    return (bytes / (1024 ** 3)).toFixed(1) + " GB";
}

function parseJSON(str) {
    try {
        return JSON.parse(str);
    } catch {
        // Find JSON part if script outputs garbage before
        const match = str.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : null;
    }
}

// Load Dashboard Status
function loadStatus() {
    GetStatus().then(res => {
        try {
            const data = parseJSON(res);
            if (!data) return;
            
            // Health Score
            document.getElementById('health-score').innerText = data.health_score || '--';

            // CPU
            if (data.cpu) {
                document.getElementById('cpu-percent').innerText = `${data.cpu.usage.toFixed(1)}%`;
                document.getElementById('cpu-fill').style.width = `${data.cpu.usage}%`;
                document.getElementById('cpu-cores').innerText = `${data.cpu.logical_cpu} Cores`;
            }

            // RAM
            if (data.memory) {
                document.getElementById('ram-percent').innerText = `${data.memory.used_percent.toFixed(1)}%`;
                document.getElementById('ram-fill').style.width = `${data.memory.used_percent}%`;
                document.getElementById('ram-used').innerText = bytesToGB(data.memory.used);
                document.getElementById('ram-total').innerText = bytesToGB(data.memory.total);
            }

            // Disk (Take primary drive)
            if (data.disks && data.disks.length > 0) {
                const disk = data.disks[0];
                document.getElementById('disk-percent').innerText = `${disk.used_percent.toFixed(1)}%`;
                document.getElementById('disk-fill').style.width = `${disk.used_percent}%`;
                document.getElementById('disk-free').innerText = bytesToGB(disk.free);
            }
        } catch (e) {
            console.error("Failed parsing status payload", e, res);
        }
    }).catch(err => {
        console.error("GetStatus Call Error:", err);
    });
}

// Global Wails events listener for log streams
EventsOn("log", (msg) => {
    // Append to active log container based on context
    const cleanLogs = document.getElementById('clean-logs');
    if (msg.trim()) {
        const div = document.createElement('div');
        div.className = 'log-line';
        div.innerHTML = msg.replace(/\n/g, '<br/>'); // Handle newlines
        cleanLogs.appendChild(div);
        cleanLogs.scrollTop = cleanLogs.scrollHeight;
    }
});

// Run Clean Action
window.runClean = function() {
    const btn = document.getElementById('start-clean-btn');
    const logs = document.getElementById('clean-logs');
    btn.disabled = true;
    btn.innerText = "Cleaning...";
    logs.innerHTML = "<div class='log-line'>Starting cleanup process...</div>";

    RunAction("clean").then(res => {
        btn.disabled = false;
        btn.innerText = "Start Cleaning";
        const div = document.createElement('div');
        div.innerHTML = "<br/><b>Cleanup process completed! Reclaimed space successfully.</b>";
        logs.appendChild(div);
        logs.scrollTop = logs.scrollHeight;
        
        // Refresh dashboard immediately after clean
        loadStatus();
    }).catch(err => {
        btn.disabled = false;
        btn.innerText = "Start Cleaning";
        logs.innerHTML += `<div class='log-line' style='color: #ff5555;'>Error: ${err}</div>`;
    });
};

// Run Analyze Action
window.runAnalyze = function() {
    const logs = document.getElementById('analyze-logs');
    logs.innerHTML = "<div class='log-line'>Analyzing disk...</div>";
    
    AnalyzeDisk("/").then(res => {
        try {
            const data = parseJSON(res);
            logs.innerHTML = `<div class='log-line'><b>Root Disk Analyzed!</b><br/>Total Used: ${bytesToGB(data?.total_size)}<br/><br/>Top directories:</div>`;
            
            data?.entries?.slice(0, 10).forEach(entry => {
                logs.innerHTML += `<div class='log-line'>- ${entry.name}: ${bytesToGB(entry.size)}</div>`;
            });
        } catch(e) {
            logs.innerHTML += `<div class='log-line'>Failed parsing analysis data. ${res}</div>`;
        }
    }).catch(err => {
        logs.innerHTML += `<div class='log-line' style='color: #ff5555;'>Error: ${err}</div>`;
    });
};

// Initiate first load
loadStatus();
