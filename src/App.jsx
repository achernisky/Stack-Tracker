import React, { useState, useEffect, useCallback } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg: "#0f1117", surface: "#1a1d27", surfaceAlt: "#222636",
  border: "#2a2f42", borderDark: "#3a4058",
  accent: "#2dd4a0", accentLight: "#0d2a22", accentText: "#2dd4a0",
  amber: "#f5a623", amberLight: "#2a1f08",
  red: "#f06060", redLight: "#2a1010",
  blue: "#6b9cf5", purple: "#a78bfa",
  text: "#e8eaf2", textSec: "#8891aa", textMuted: "#4a5168",
  white: "#e8eaf2",
};
const F = {
  serif: "'Georgia','Times New Roman',serif",
  sans: "'Inter',system-ui,-apple-system,sans-serif",
  mono: "'JetBrains Mono','Fira Mono',monospace",
};

// ─── SUPABASE AUTH ────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://npjeglrrnqebkitvvctr.supabase.co";
const SUPABASE_KEY = "sb_publishable_-bteqtNtAwP7B7rXqgYydw_DtyM0Vke";

async function sbFetch(path, opts = {}) {
  const session = JSON.parse(localStorage.getItem("sb-session") || "null");
  const token = session?.access_token || SUPABASE_KEY;
  return fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + token,
      ...(opts.headers || {}),
    },
  });
}

async function signIn(email, password) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem("sb-session", JSON.stringify(data));
    return { user: data.user, error: null };
  }
  return { user: null, error: data.error_description || data.msg || "Login failed" };
}

async function signOut() {
  const session = JSON.parse(localStorage.getItem("sb-session") || "null");
  if (session?.access_token) {
    await fetch(SUPABASE_URL + "/auth/v1/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + session.access_token },
    });
  }
  localStorage.removeItem("sb-session");
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("sb-session") || "null"); } catch { return null; }
}

async function changePassword(newPassword) {
  const session = JSON.parse(localStorage.getItem("sb-session") || "null");
  if (!session?.access_token) return { error: "Not logged in" };
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": "Bearer " + session.access_token },
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await r.json();
  if (data.id) return { error: null };
  return { error: data.message || "Failed to update password" };
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    const { user, error: err } = await signIn(email, password);
    if (user) {
      onLogin(user);
    } else {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:"0 24px"}}>
      <div style={{fontSize:26,fontWeight:700,color:"#e8eaf2",marginBottom:6}}>Stack Tracker</div>
      <div style={{fontSize:13,color:"#8891aa",marginBottom:40}}>Sign in to continue</div>
      <div style={{width:"100%",maxWidth:320}}>
        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{width:"100%",background:"#1a1d27",border:"1px solid #2a2f42",borderRadius:10,padding:"14px 16px",color:"#e8eaf2",fontSize:15,marginBottom:12,outline:"none",boxSizing:"border-box"}}
        />
        <input
          type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{width:"100%",background:"#1a1d27",border:"1px solid #2a2f42",borderRadius:10,padding:"14px 16px",color:"#e8eaf2",fontSize:15,marginBottom:16,outline:"none",boxSizing:"border-box"}}
        />
        {error && <div style={{color:"#f06060",fontSize:13,marginBottom:12,textAlign:"center"}}>{error}</div>}
        <button
          onClick={handleLogin} disabled={loading}
          style={{width:"100%",background:"#2dd4a0",color:"#0f1117",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",opacity:loading?0.7:1}}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── DEFAULT DATA (blank slate for new users) ─────────────────────────────────
const DEFAULT_COMPOUNDS = [];
const DEFAULT_VIALS = [];

// ─── STORAGE (Supabase per-user) ──────────────────────────────────────────────
async function loadData(userId) {
  try {
    const r = await sbFetch(`/rest/v1/stack_tracker?user_id=eq.${userId}&select=data`);
    const j = await r.json();
    return j?.[0]?.data && Object.keys(j[0].data).length ? j[0].data : null;
  } catch { return null; }
}
async function saveData(d, userId) {
  try {
    // Try update first
    const r = await sbFetch(`/rest/v1/stack_tracker?user_id=eq.${userId}`, {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ data: d }),
    });
    // If no rows updated, insert
    if (r.status === 200 || r.status === 204) return;
    await sbFetch("/rest/v1/stack_tracker", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ id: "user-" + userId, user_id: userId, data: d }),
    });
  } catch {}
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
async function registerPush(userId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const session = JSON.parse(localStorage.getItem("sb-session") || "null");
    const token = session?.access_token || SUPABASE_KEY;
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("SW registered:", reg);
    await navigator.serviceWorker.ready;
    console.log("SW ready");
    const perm = await Notification.requestPermission();
    console.log("Permission:", perm);
    if (perm !== "granted") return null;
    const existing = await reg.pushManager.getSubscription();
    if (existing) { console.log("Unsubscribing existing"); await existing.unsubscribe(); }
    const vapidKey = "BEl62iUYgUivxIkv69yViEuiBIa40HI2KAtGRB5G9L3kBSBMbKLVlhCoJwqBOYCJIcJHBV7cNFCMSOuRVjNFTE4";
    const b64 = vapidKey.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    const raw = atob(padded);
    const appKey = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      appKey[i] = raw.charCodeAt(i);
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    });
    console.log("Subscribed:", JSON.stringify(sub).substring(0, 100));
    const headers = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + token,
      "Prefer": "return=minimal"
    };
    await fetch(SUPABASE_URL + "/rest/v1/push_subscriptions?user_id=eq." + userId, { method: "DELETE", headers });
    const saveRes = await fetch(SUPABASE_URL + "/rest/v1/push_subscriptions", {
      method: "POST", headers,
      body: JSON.stringify({ user_id: userId, subscription: JSON.stringify(sub) })
    });
    console.log("Saved subscription:", saveRes.status);
    return sub;
  } catch(e) {
    console.error("Push registration failed:", e.name, e.message);
    return { error: e.name + ": " + e.message };
  }
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_FULL  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function todayStr() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseLocal(s) { if(!s)return new Date(); const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d); }
function addDays(s,n) { const d=parseLocal(s);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function diffDays(a,b) { return Math.round((parseLocal(b)-parseLocal(a))/86400000); }
function weekStart(s) { const d=parseLocal(s);d.setDate(d.getDate()-d.getDay());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtDateFull(s) { const d=parseLocal(s);return `${DAY_NAMES[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; }
function weekRange(ws) {
  const s=parseLocal(ws),e=parseLocal(addDays(ws,6));
  return s.getMonth()===e.getMonth()?`${MON[s.getMonth()]} ${s.getDate()}–${e.getDate()}`:`${MON[s.getMonth()]} ${s.getDate()}–${MON[e.getMonth()]} ${e.getDate()}`;
}
function activeStage(stages,date) {
  return [...stages].filter(s=>s.fromDate&&s.fromDate<=date).sort((a,b)=>b.fromDate.localeCompare(a.fromDate))[0]||stages[0];
}
function calcRecon(vialMg,bacMl) {
  if(!vialMg||!bacMl)return null;
  const mgPerMl=vialMg/bacMl;
  return {mgPerMl, mcgPerUnit:mgPerMl*10};
}
function doseToUnits(doseMg,mgPerMl) { return doseMg&&mgPerMl?Math.round((doseMg/mgPerMl)*100):null; }
function cycleWeek(start,date) { return Math.max(1,Math.floor(diffDays(start,date)/7)+1); }
function vialDaysLeft(vial) {
  if(!vial.reconDate)return null;
  return 28 - diffDays(vial.reconDate, todayStr());
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const iSty = { fontFamily:F.sans,fontSize:14,color:C.text,background:C.surfaceAlt,border:`1px solid ${C.borderDark}`,borderRadius:7,padding:"9px 12px",outline:"none",width:"100%",boxSizing:"border-box" };
const bSty = (v="primary") => ({
  padding:"8px 16px",borderRadius:8,fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer",
  background:v==="primary"?C.accent:v==="danger"?"transparent":C.surfaceAlt,
  color:v==="primary"?C.bg:v==="danger"?C.red:C.text,
  border:v==="primary"?"none":`1px solid ${v==="danger"?C.borderDark:C.borderDark}`,
});
const card = (extra={}) => ({ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:16, ...extra });


// ─── DOSE LOG MODAL ───────────────────────────────────────────────────────────
// When tapping a dose, optionally record units drawn
function DoseLogModal({ compound, dateStr, existingLog, onSave, onClose }) {
  const recon = calcRecon(compound.vialMg, compound.bacMl);
  const ds = activeStage(compound.doseStages, dateStr);
  const defaultUnits = ds?.doseMg && recon ? doseToUnits(ds.doseMg, recon.mgPerMl) : ds?.doseUnits || "";
  const [units, setUnits] = useState(existingLog?.units ?? defaultUnits ?? "");
  const [notes, setNotes] = useState(existingLog?.notes ?? "");

  return (
    <div style={{position:"fixed",inset:0,background:"#000b",display:"flex",alignItems:"flex-end",zIndex:300}}>
      <div style={{background:C.surface,borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxHeight:"70vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <div style={{width:12,height:12,borderRadius:"50%",background:compound.color}}/>
          <span style={{fontFamily:F.sans,fontSize:16,fontWeight:700,color:C.text}}>{compound.name}</span>
          <span style={{fontFamily:F.sans,fontSize:13,color:C.textSec}}>{dateStr}</span>
        </div>
        <div style={{marginBottom:14}}>
          <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Units drawn (U-100)</span>
          <input type="number" min="0" step="1" value={units} onChange={e=>setUnits(e.target.value)}
            style={iSty} placeholder={`e.g. ${defaultUnits || 40}`} />
          {recon && units && (
            <div style={{fontFamily:F.sans,fontSize:12,color:C.accentText,marginTop:5}}>
              = {(parseFloat(units)*recon.mgPerMl/100).toFixed(2)} mg drawn
            </div>
          )}
        </div>
        <div style={{marginBottom:18}}>
          <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Notes (optional)</span>
          <input value={notes} onChange={e=>setNotes(e.target.value)} style={iSty} placeholder="Energy, appetite, side effects..." />
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onSave({units:parseFloat(units)||null,notes,time:new Date().toISOString()})} style={{...bSty("primary"),flex:1,padding:12}}>
            {existingLog ? "Update" : "Mark done"}
          </button>
          {existingLog && <button onClick={()=>onSave(null)} style={{...bSty("danger"),flex:1,padding:12}}>Unlog</button>}
          <button onClick={onClose} style={{...bSty("outline"),flex:1,padding:12}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── SCHEDULE TAB ─────────────────────────────────────────────────────────────
function fmt12hr(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

// Convert local HH:MM to UTC HH:MM for storage
function localToUTC(localTime) {
  if (!localTime) return "";
  const [h, m] = localTime.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

// Convert UTC HH:MM to local HH:MM for display
function utcToLocal(utcTime) {
  if (!utcTime) return "";
  const [h, m] = utcTime.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function NotificationModal({ compound, onSave, onClose, userId }) {
  const [time, setTime] = React.useState(compound.notifyTime ? utcToLocal(compound.notifyTime) : "");
  const [enabled, setEnabled] = React.useState(compound.notifyEnabled !== false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState("");

  const handle = async () => {
    if (saving) return;
    setSaving(true);
    setStatus("");
    if (enabled) {
      setStatus("Registering...");
      const sub = await registerPush(userId);
      if (sub && !sub.error) {
        setStatus("✓ Push notifications enabled");
      } else {
        setStatus("✗ " + (sub?.error || "Push failed — check permissions"));
      }
      // Save and close after showing status
      setTimeout(() => {
        onSave({ ...compound, notifyTime: localToUTC(time), notifyEnabled: enabled });
        onClose();
      }, 1500);
    } else {
      onSave({ ...compound, notifyTime: localToUTC(time), notifyEnabled: false });
      onClose();
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000c",display:"flex",alignItems:"flex-end",zIndex:300}}>
      <div style={{background:C.surface,borderRadius:"16px 16px 0 0",padding:24,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:12,height:12,borderRadius:"50%",background:compound.color}}/>
          <span style={{fontFamily:F.serif,fontSize:18,fontWeight:700,color:C.text}}>{compound.name}</span>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,padding:"14px 16px",background:C.surfaceAlt,borderRadius:10}}>
          <div>
            <div style={{fontFamily:F.sans,fontSize:14,fontWeight:600,color:C.text}}>Notifications</div>
            <div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginTop:2}}>Remind me on scheduled days</div>
          </div>
          <div onClick={()=>setEnabled(e=>!e)} style={{
            width:48,height:28,borderRadius:14,cursor:"pointer",transition:"background 0.2s",
            background:enabled?C.accent:C.border,position:"relative",flexShrink:0,
          }}>
            <div style={{
              width:22,height:22,borderRadius:11,background:C.white,position:"absolute",
              top:3,left:enabled?23:3,transition:"left 0.2s",
            }}/>
          </div>
        </div>

        {enabled && (
          <div style={{marginBottom:20}}>
            <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:6}}>Notification time</span>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{...iSty, display:"none"}} id="notify-time-input"/>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={time ? (parseInt(time.split(":")[0]) % 12 || 12) : ""} onChange={e=>{
                const h = parseInt(e.target.value);
                const mins = time ? time.split(":")[1] : "00";
                const isPM = time ? parseInt(time.split(":")[0]) >= 12 : false;
                const h24 = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                setTime(`${String(h24).padStart(2,"0")}:${mins}`);
              }} style={{...iSty, flex:1}}>
                <option value="">Hour</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(h=><option key={h} value={h}>{h}</option>)}
              </select>
              <select value={time ? time.split(":")[1] : ""} onChange={e=>{
                const h = time ? time.split(":")[0] : "08";
                setTime(`${h}:${e.target.value}`);
              }} style={{...iSty, flex:1}}>
                <option value="">Min</option>
                {Array.from({length:60},(_,i)=>String(i).padStart(2,"0")).map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <select value={time ? (parseInt(time.split(":")[0]) >= 12 ? "PM" : "AM") : ""} onChange={e=>{
                if (!time) return;
                const [h, m] = time.split(":").map(Number);
                const isPM = e.target.value === "PM";
                const h24 = isPM ? (h % 12 + 12) : (h % 12);
                setTime(`${String(h24).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
              }} style={{...iSty, flex:1}}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
            {time && <div style={{fontFamily:F.sans,fontSize:12,color:C.accentText,marginTop:6}}>{fmt12hr(time)} — your device timezone</div>}
          </div>
        )}

        {status && <div style={{fontFamily:F.sans,fontSize:13,color:status.includes("✓")?C.accent:C.red,marginBottom:12,textAlign:"center"}}>{status}</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={handle} disabled={saving} style={{...bSty("primary"),flex:1,padding:12,opacity:saving?0.7:1}}>
            {saving?"Working...":"Save"}
          </button>
          <button onClick={onClose} style={{...bSty("outline"),flex:1,padding:12}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DoseRow({compound, dateStr, logged, units, ds, inWeek=false, onOpenModal, onOpenNotify}) {
  const notifyOn = compound.notifyEnabled !== false && compound.notifyTime;
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:inWeek?0:10,padding:inWeek?"6px 16px 8px":0}}>
      <div onClick={()=>onOpenModal({compound,dateStr})} style={{
        width:inWeek?20:22,height:inWeek?20:22,borderRadius:5,flexShrink:0,cursor:"pointer",
        border:`2px solid ${logged?C.accent:C.borderDark}`,
        background:logged?C.accent:"transparent",
        display:"flex",alignItems:"center",justifyContent:"center",
      }}>
        {logged && <span style={{color:C.bg,fontSize:inWeek?11:13}}>✓</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flex:1}} onClick={()=>onOpenNotify(compound)}>
        <div style={{width:8,height:8,borderRadius:"50%",background:compound.color,flexShrink:0}}/>
        <span style={{fontFamily:F.sans,fontSize:inWeek?14:15,color:logged?C.textMuted:C.text,textDecoration:logged?"line-through":"none"}}>{compound.name}</span>
        {compound.timing && !["Daily","Weekly"].includes(compound.timing) && (
          <span style={{fontFamily:F.sans,fontSize:10,background:C.surfaceAlt,color:C.textSec,padding:"1px 6px",borderRadius:10,fontWeight:600}}>{compound.timing}</span>
        )}
        {compound.notifyTime && (
          <span style={{fontFamily:F.mono,fontSize:10,color:notifyOn?C.accent:C.textMuted}}>
            {notifyOn ? "🔔" : "🔕"} {fmt12hr(utcToLocal(compound.notifyTime))}
          </span>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {logged?.units && <span style={{fontFamily:F.mono,fontSize:11,color:C.accent}}>{logged.units}u</span>}
        {(ds?.doseMg||units) && (
          <span style={{fontFamily:F.mono,fontSize:12,color:C.textSec,background:C.surfaceAlt,padding:"2px 7px",borderRadius:6}}>
            {ds?.doseMg?`${ds.doseMg}mg`:""}{units?` · ${units}u`:""}
          </span>
        )}
      </div>
    </div>
  );
}


function ScheduleTab({ compounds, logs, onToggle, onMarkAll, cycleStart, vials, onUpdateCompound, user }) {
  const today = todayStr();
  const [notifyModal, setNotifyModal] = useState(null);
  const [doseModal, setDoseModal] = useState(null);
  const active = compounds.filter(c=>c.status==="active");
  const pending = compounds.filter(c=>c.status==="pending");
  const curWS = weekStart(today);
  const [expanded, setExpanded] = useState(curWS);

  const starts = active.flatMap(c=>c.dayStages.map(s=>s.fromDate)).filter(Boolean);
  const earliest = starts.length?starts.reduce((a,b)=>a<b?a:b):cycleStart;
  const lastWS = weekStart(addDays(today,7));
  const weeks=[];
  let ws=weekStart(earliest);
  while(ws<=lastWS){weeks.push(ws);ws=addDays(ws,7);}
  weeks.reverse();

  function weekDoses(ws) {
    let total=0,done=0;
    for(const c of active) for(let i=0;i<7;i++){
      const ds=addDays(ws,i),dayName=DAY_NAMES[parseLocal(ds).getDay()];
      const stage=activeStage(c.dayStages,ds);
      if(stage?.days.includes(dayName)){total++;if(logs[c.id]?.[ds])done++;}
    }
    return{total,done};
  }

  const todayDay = DAY_NAMES[new Date().getDay()];
  const todayDoses = active.flatMap(c=>{
    const stage=activeStage(c.dayStages,today);
    if(!stage?.days.includes(todayDay))return[];
    const ds=activeStage(c.doseStages,today);
    const recon=calcRecon(c.vialMg,c.bacMl);
    const units=ds?.doseMg&&recon?doseToUnits(ds.doseMg,recon.mgPerMl):ds?.doseUnits||null;
    return[{c,ds,units,logged:logs[c.id]?.[today]||null}];
  });

  // Active vial expiry warnings
  const expiryWarnings = vials.filter(v=>v.status==="active"&&v.reconDate).map(v=>{
    const daysLeft=vialDaysLeft(v);
    const c=compounds.find(x=>x.id===v.compoundId||x.id==="reta-wife"&&v.compoundId==="reta");
    return{v,c,daysLeft};
  }).filter(x=>x.daysLeft!==null&&x.daysLeft<=10);



  return (
    <div style={{padding:"16px 16px 40px"}}>
      {/* Expiry warnings */}
      {expiryWarnings.map(({v,c,daysLeft})=>(
        <div key={v.id} style={{background:C.redLight,border:`1px solid ${C.red}40`,borderRadius:9,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:16}}>⚠️</span>
          <span style={{fontFamily:F.sans,fontSize:13,color:C.red}}>
            {c?.name||v.compoundId} vial expires in <strong>{daysLeft} day{daysLeft!==1?"s":""}</strong> (reconstituted {v.reconDate})
          </span>
        </div>
      ))}

      {/* Today */}
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:F.serif,fontSize:26,fontWeight:700,color:C.text,marginBottom:2}}>Today</div>
        <div style={{fontFamily:F.sans,fontSize:13,color:C.textSec,marginBottom:14}}>
          {DAY_FULL[new Date().getDay()]}, {MON[new Date().getMonth()]} {new Date().getDate()}
        </div>
        {todayDoses.length===0
          ?<div style={{fontFamily:F.sans,fontSize:14,color:C.textMuted}}>Rest day — no doses scheduled.</div>
          :todayDoses.map(({c,ds,units,logged})=>(
            <DoseRow key={c.id} compound={c} dateStr={today} logged={logged} units={units} ds={ds} onOpenModal={setDoseModal} onOpenNotify={setNotifyModal}/>
          ))
        }
      </div>

      {/* Pending callout */}
      {pending.length>0&&(
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}40`,borderRadius:9,padding:"12px 14px",marginBottom:20}}>
          <div style={{fontFamily:F.sans,fontSize:12,fontWeight:700,color:C.amber,marginBottom:6,letterSpacing:"0.05em"}}>INBOUND — NOT YET STARTED</div>
          {pending.map(c=>(
            <div key={c.id} style={{fontFamily:F.sans,fontSize:13,color:C.textSec,marginBottom:3,display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>{c.name} — {c.notes}
            </div>
          ))}
          <div style={{fontFamily:F.sans,fontSize:12,color:C.textMuted,marginTop:8}}>Set a start date in Edit Plan to add to schedule.</div>
        </div>
      )}

      <div style={{height:1,background:C.border,marginBottom:20}}/>

      {/* Week list */}
      {weeks.map(ws=>{
        const wn=cycleWeek(cycleStart,ws),isNow=ws===curWS;
        const{total,done}=weekDoses(ws);
        const allDone=total>0&&done===total,isOpen=expanded===ws;
        const dayMap={};
        for(const c of active) for(let i=0;i<7;i++){
          const ds=addDays(ws,i),dayName=DAY_NAMES[parseLocal(ds).getDay()];
          const stage=activeStage(c.dayStages,ds);
          if(!stage?.days.includes(dayName))continue;
          if(!dayMap[ds])dayMap[ds]=[];
          const doseStage=activeStage(c.doseStages,ds);
          const recon=calcRecon(c.vialMg,c.bacMl);
          const units=doseStage?.doseMg&&recon?doseToUnits(doseStage.doseMg,recon.mgPerMl):doseStage?.doseUnits||null;
          dayMap[ds].push({c,doseStage,units,logged:logs[c.id]?.[ds]||null});
        }
        const days=Object.keys(dayMap).sort();
        return(
          <div key={ws} style={{marginBottom:10,border:`1px solid ${isNow?C.accent:C.border}`,borderRadius:10,overflow:"hidden",background:C.surface}}>
            <div onClick={()=>setExpanded(isOpen?null:ws)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",cursor:"pointer",background:isNow?C.accentLight:C.surface}}>
              <div>
                <span style={{fontFamily:F.sans,fontSize:15,fontWeight:700,color:C.text}}>Week {wn}</span>
                {isNow&&<span style={{fontFamily:F.sans,fontSize:11,color:C.accent,fontWeight:600,marginLeft:6}}>· now</span>}
                <span style={{fontFamily:F.sans,fontSize:13,color:C.textSec,marginLeft:6}}>{weekRange(ws)}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontFamily:F.sans,fontSize:12,color:allDone?C.accent:C.textSec}}>
                  {total} doses{allDone?" · ✓ all done":done>0?` · ${done}/${total}`:""}
                </span>
                <button onClick={e=>{e.stopPropagation();onMarkAll(ws,allDone);}} style={{
                  padding:"4px 10px",borderRadius:6,fontFamily:F.sans,fontSize:11,fontWeight:600,cursor:"pointer",
                  background:allDone?C.surfaceAlt:C.accent,color:allDone?C.textSec:C.bg,
                  border:`1px solid ${allDone?C.border:C.accent}`,
                }}>
                  {allDone?"Unmark all":"Mark all"}
                </button>
                <span style={{color:C.textMuted,fontSize:11}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            {isOpen&&(
              <div style={{borderTop:`1px solid ${C.border}`}}>
                {days.map(ds=>{
                  const isToday=ds===today,d=parseLocal(ds);
                  return(
                    <div key={ds} style={{borderBottom:`1px solid ${C.border}`}}>
                      <div style={{padding:"8px 16px 3px",fontFamily:F.sans,fontSize:11,fontWeight:700,color:isToday?C.accent:C.textSec,letterSpacing:"0.06em",textTransform:"uppercase"}}>
                        {DAY_NAMES[d.getDay()]} {MON[d.getMonth()]} {d.getDate()}{isToday?" · TODAY":""}
                      </div>
                      {dayMap[ds].map(({c,doseStage,units,logged})=>(
                        <DoseRow key={c.id} compound={c} dateStr={ds} logged={logged} units={units}
                          ds={doseStage} inWeek={true}
                          onOpenModal={setDoseModal}
                          onOpenNotify={setNotifyModal}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {doseModal&&(
        <DoseLogModal
          compound={doseModal.compound}
          dateStr={doseModal.dateStr}
          existingLog={logs[doseModal.compound.id]?.[doseModal.dateStr]||null}
          onSave={entry=>{onToggle(doseModal.compound.id,doseModal.dateStr,entry);setDoseModal(null);}}
          onClose={()=>setDoseModal(null)}
        />
      )}
      {notifyModal&&(
        <NotificationModal
          compound={notifyModal}
          userId={user?.id}
          onSave={updated=>{ onUpdateCompound(updated); }}
          onClose={()=>setNotifyModal(null)}
        />
      )}
    </div>
  );
}

// ─── RECONSTITUTION TAB ───────────────────────────────────────────────────────
function ReconTab({ compounds, vials }) {
  const [bacOv,setBacOv]=useState({});
  const [doseOv,setDoseOv]=useState({});
  const peptides=compounds.filter(c=>c.vialMg!==null);
  const oils=compounds.filter(c=>c.vialMg===null);

  return(
    <div style={{padding:"16px 16px 40px"}}>
      <p style={{fontFamily:F.sans,fontSize:13,color:C.textSec,marginBottom:20,lineHeight:1.6}}>
        Live concentration calculator. You inject with a <strong>U-100 insulin syringe</strong> (1 unit = 0.01 mL).
      </p>
      {peptides.map(c=>{
        const bacRaw=bacOv[c.id]??String(c.bacMl??1);
        const bac=parseFloat(bacRaw)||null;
        const recon=calcRecon(c.vialMg,bac);
        const ds=activeStage(c.doseStages,todayStr());
        const doseRaw=doseOv[c.id]??String(ds?.doseMg??"");
        const doseMgCalc=parseFloat(doseRaw)||null;
        const units=doseMgCalc&&recon?doseToUnits(doseMgCalc,recon.mgPerMl):null;
        const isPending=c.status==="pending";

        // Doses remaining in active vial
        const activeVial=vials.find(v=>v.compoundId===c.id&&v.status==="active");
        const mgRemaining=activeVial?(activeVial.totalMg-activeVial.usedMg):null;
        const dosesLeft=mgRemaining&&doseMgCalc?Math.floor(mgRemaining/doseMgCalc):null;

        return(
          <div key={c.id} style={{...card({marginBottom:14}),opacity:isPending?0.8:1,borderColor:isPending?`${C.amber}40`:C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:c.color}}/>
              <span style={{fontFamily:F.sans,fontSize:16,fontWeight:700,color:C.text}}>{c.name}</span>
              {isPending&&<span style={{fontFamily:F.sans,fontSize:11,background:C.amberLight,color:C.amber,padding:"2px 8px",borderRadius:10,fontWeight:600}}>INBOUND</span>}
            </div>
            <div style={{display:"flex",gap:12,marginBottom:14}}>
              <div style={{flex:1}}>
                <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Vial (mg)</span>
                <div style={{fontFamily:F.sans,fontSize:15,fontWeight:600,color:C.text,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px"}}>{c.vialMg} mg</div>
              </div>
              <div style={{flex:1}}>
                <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>BAC water (mL)</span>
                <input type="number" step="0.5" min="0.5" value={bacRaw}
                  onChange={e=>setBacOv(o=>({...o,[c.id]:e.target.value}))} style={iSty}/>
              </div>
            </div>
            {recon&&(
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                <div style={{flex:1,background:C.surfaceAlt,borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontFamily:F.sans,fontSize:11,color:C.textSec,marginBottom:3}}>Concentration</div>
                  <div style={{fontFamily:F.sans,fontSize:20,fontWeight:700,color:C.text}}>{recon.mgPerMl.toFixed(2)}</div>
                  <div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>mg/mL</div>
                </div>
                <div style={{flex:1,background:C.surfaceAlt,borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontFamily:F.sans,fontSize:11,color:C.textSec,marginBottom:3}}>Per unit</div>
                  <div style={{fontFamily:F.sans,fontSize:20,fontWeight:700,color:C.text}}>{recon.mcgPerUnit.toFixed(0)}</div>
                  <div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>mcg/unit</div>
                </div>
              </div>
            )}
            {recon&&(
              <div style={{display:"flex",gap:12}}>
                <div style={{flex:1}}>
                  <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Dose (mg)</span>
                  <input type="number" step="0.1" min="0" placeholder="e.g. 4" value={doseRaw}
                    onChange={e=>setDoseOv(o=>({...o,[c.id]:e.target.value}))} style={iSty}/>
                </div>
                <div style={{flex:1}}>
                  <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Units to draw</span>
                  <div style={{fontFamily:F.sans,fontSize:22,fontWeight:700,color:units?C.text:C.textMuted,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 12px"}}>
                    {units?`${units} units`:"—"}
                  </div>
                </div>
              </div>
            )}
            {dosesLeft!==null&&(
              <div style={{marginTop:12,fontFamily:F.sans,fontSize:12,color:C.textSec}}>
                Active vial: <strong style={{color:dosesLeft<=2?C.amber:C.text}}>{mgRemaining?.toFixed(1)} mg remaining</strong> ≈ {dosesLeft} more dose{dosesLeft!==1?"s":""} before next vial
              </div>
            )}
          </div>
        );
      })}
      {oils.map(c=>(
        <div key={c.id} style={{...card({marginBottom:14})}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:c.color}}/>
            <span style={{fontFamily:F.sans,fontSize:16,fontWeight:700,color:C.text}}>{c.name}</span>
          </div>
          <div style={{fontFamily:F.sans,fontSize:13,color:C.textSec,lineHeight:1.7}}>
            Pre-mixed oil — no reconstitution needed.<br/>
            200 mg/mL · {activeStage(c.doseStages,todayStr())?.doseUnits||12} units/day on U-100 syringe.
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── INVENTORY TAB ────────────────────────────────────────────────────────────
function VialCard({ vial, compounds, vials, onUpdateVials, setEditVial }) {
  const c = compounds.find(x => x.id === vial.compoundId);
  const isOil = c?.bacMl === null;
  const rem = vial.totalMg - vial.usedMg;
  const pct = vial.totalMg > 0 ? (rem / vial.totalMg) * 100 : 0;
  const daysLeft = vialDaysLeft(vial);
  const expiring = daysLeft !== null && daysLeft <= 7;
  // Days remaining for oil vials (TRT): units/day * 0.01mL * 200mg/mL
  const ds = c ? activeStage(c.doseStages, todayStr()) : null;
  const daysRemaining = isOil && ds?.doseUnits
    ? Math.floor(rem / (ds.doseUnits * 0.01 * 200))
    : 0;
  return (
    <div style={{...card({marginBottom:10}), borderLeft:`3px solid ${c?.color||C.accent}`, borderColor:expiring?C.red:C.border}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <span style={{fontFamily:F.sans,fontSize:15,fontWeight:700,color:C.text}}>{c?.name||vial.compoundId} </span>
          <span style={{fontFamily:F.sans,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:10,
            background:vial.status==="active"?C.accent:C.surfaceAlt,
            color:vial.status==="active"?C.bg:C.textSec,
          }}>{vial.status==="active"?"ACTIVE":"RESERVE"}</span>
        </div>
        <div style={{display:"flex",gap:7}}>
          {vial.status==="reserve" && (
            <button onClick={()=>onUpdateVials(vials.map(v=>v.id===vial.id?{...v,status:"active"}:v))}
              style={{...bSty("primary"),padding:"5px 12px",fontSize:12}}>Activate</button>
          )}
          <button onClick={()=>setEditVial(vial)} style={{...bSty("outline"),padding:"5px 10px",fontSize:12}}>Edit</button>
          <button onClick={()=>onUpdateVials(vials.filter(v=>v.id!==vial.id))}
            style={{...bSty("danger"),padding:"5px 10px",fontSize:12}}>Delete</button>
        </div>
      </div>
      <div style={{display:"flex",gap:20,marginBottom:10,flexWrap:"wrap"}}>
        <div><div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Vendor</div><div style={{fontFamily:F.sans,fontSize:13,fontWeight:600,color:C.text}}>{vial.vendor||"—"}</div></div>
        <div><div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Lot</div><div style={{fontFamily:F.sans,fontSize:13,fontWeight:600,color:C.text}}>{vial.lot||"—"}</div></div>
        {vial.status==="active" && vial.reconDate && (
          <div>
            <div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Reconstituted</div>
            <div style={{fontFamily:F.sans,fontSize:13,fontWeight:600,color:expiring?C.red:C.text}}>
              {vial.reconDate}{expiring ? ` · ⚠️ ${daysLeft}d left` : ""}
            </div>
          </div>
        )}
      </div>
      {isOil ? (
        <div style={{fontFamily:F.sans,fontSize:13,marginBottom:6,color:C.text}}>
          {vial.status==="active"
            ? daysRemaining <= 0
              ? <span style={{color:C.red}}>⚠️ Finishing today — activate reserve</span>
              : <span><strong style={{color:daysRemaining<=5?C.amber:C.text}}>{daysRemaining} days</strong> remaining at current dose</span>
            : <span>Sealed · {vial.totalMg}mg total</span>
          }
        </div>
      ) : (
        <div style={{fontFamily:F.sans,fontSize:13,marginBottom:6,color:C.text}}>
          <strong>{rem.toFixed(1)} mg</strong> of {vial.totalMg} mg ({Math.round(pct)}%)
        </div>
      )}
      <div style={{height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:c?.color||C.accent,borderRadius:3,transition:"width 0.3s"}}/>
      </div>
    </div>
  );
}

function InventoryTab({ compounds, vials, onUpdateVials }) {
  const [addModal,setAddModal]=useState(false);
  const [editVial,setEditVial]=useState(null);
  const active=vials.filter(v=>v.status==="active");
  const reserves=vials.filter(v=>v.status==="reserve");
  const totalMg=vials.reduce((s,v)=>s+(v.totalMg-v.usedMg),0);

  // Low stock alerts: compounds with ≤2 reserves
  const lowStock=compounds.filter(c=>{
    if(c.status==="pending") return false;
    if(c.id==="reta-wife") return false; // shares vial pool with Reta (Alex)
    const count=reserves.filter(v=>v.compoundId===c.id).length;
    return count<=2;
  });



  const saveVial=vial=>{
    onUpdateVials(vials.find(v=>v.id===vial.id)?vials.map(v=>v.id===vial.id?vial:v):[...vials,vial]);
    setAddModal(false);setEditVial(null);
  };

  const compoundIds=[...new Set(reserves.map(v=>v.compoundId))];

  return(
    <div style={{padding:"16px 16px 40px"}}>
      {/* Low stock */}
      {lowStock.length>0&&(
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}40`,borderRadius:9,padding:"12px 14px",marginBottom:16}}>
          <div style={{fontFamily:F.sans,fontSize:12,fontWeight:700,color:C.amber,marginBottom:6}}>LOW STOCK</div>
          {lowStock.map(c=>{
            const count=reserves.filter(v=>v.compoundId===c.id).length;
            return<div key={c.id} style={{fontFamily:F.sans,fontSize:13,color:C.textSec}}>{c.name}: {count} reserve{count!==1?"s":""} remaining</div>;
          })}
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <button onClick={()=>setAddModal(true)} style={{...bSty("primary")}}>+ Add vial</button>
        <button onClick={()=>{
          const blob=new Blob([JSON.stringify({compounds,vials},null,2)],{type:"application/json"});
          const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="peptide-inventory.json";a.click();
        }} style={{...bSty("outline")}}>Export</button>
      </div>
      <div style={{fontFamily:F.sans,fontSize:13,color:C.textSec,marginBottom:18}}>
        {vials.length} vials · {active.length} active · {totalMg.toFixed(0)} mg remaining
      </div>
      <div style={{fontFamily:F.sans,fontSize:14,fontWeight:700,color:C.text,marginBottom:12}}>
        Active — in use <span style={{color:C.textMuted,fontWeight:400}}>{active.length}</span>
      </div>
      {active.length===0&&<div style={{fontFamily:F.sans,fontSize:13,color:C.textMuted,marginBottom:16}}>No active vials.</div>}
      {active.map(v=><VialCard key={v.id} vial={v} compounds={compounds} vials={vials} onUpdateVials={onUpdateVials} setEditVial={setEditVial}/>)}
      {compoundIds.length>0&&(
        <>
          <div style={{fontFamily:F.sans,fontSize:14,fontWeight:700,color:C.text,margin:"20px 0 12px"}}>
            Reserves <span style={{color:C.textMuted,fontWeight:400}}>{reserves.length}</span>
          </div>
          {compoundIds.map(cid=>{
            const c=compounds.find(x=>x.id===cid);
            const cvials=reserves.filter(v=>v.compoundId===cid);
            return(
              <div key={cid} style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:c?.color||C.accent}}/>
                  <span style={{fontFamily:F.sans,fontSize:13,fontWeight:600,color:C.text}}>{c?.name||cid}</span>
                  <span style={{fontFamily:F.sans,fontSize:12,color:C.textMuted}}>{cvials.length} vials</span>
                  {c?.status==="pending"&&<span style={{fontFamily:F.sans,fontSize:11,background:C.amberLight,color:C.amber,padding:"1px 7px",borderRadius:10,fontWeight:600}}>INBOUND</span>}
                </div>
                {cvials.map(v=><VialCard key={v.id} vial={v} compounds={compounds} vials={vials} onUpdateVials={onUpdateVials} setEditVial={setEditVial}/>)}
              </div>
            );
          })}
        </>
      )}
      {(addModal||editVial)&&(
        <VialModal vial={editVial} compounds={compounds} onSave={saveVial} onClose={()=>{setAddModal(false);setEditVial(null);}}/>
      )}
    </div>
  );
}

function VialModal({vial,compounds,onSave,onClose}){
  const[form,setForm]=useState(vial||{id:`v${Date.now()}`,compoundId:compounds[0]?.id||"",vendor:"Cici Factory",lot:"",reconDate:"",totalMg:10,usedMg:0,status:"reserve"});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return(
    <div style={{position:"fixed",inset:0,background:"#000b",display:"flex",alignItems:"flex-end",zIndex:200}}>
      <div style={{background:C.surface,borderRadius:"16px 16px 0 0",padding:24,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{fontFamily:F.serif,fontSize:20,fontWeight:700,color:C.text,marginBottom:20}}>{vial?"Edit Vial":"Add Vial"}</div>
        {[
          {label:"Compound",key:"compoundId",type:"compound"},
          {label:"Vendor",key:"vendor"},
          {label:"Lot #",key:"lot"},
          {label:"Total mg",key:"totalMg",type:"number"},
          {label:"Used mg",key:"usedMg",type:"number"},
          {label:"Status",key:"status",type:"status"},
          ...(form.status==="active"?[{label:"Reconstituted",key:"reconDate",type:"date"}]:[]),
        ].map(({label:lbl,key,type})=>(
          <div key={key} style={{marginBottom:14}}>
            <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>{lbl}</span>
            {type==="compound"?<select value={form[key]} onChange={e=>set(key,e.target.value)} style={iSty}>{compounds.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            :type==="status"?<select value={form[key]} onChange={e=>set(key,e.target.value)} style={iSty}><option value="active">Active</option><option value="reserve">Reserve</option></select>
            :<input type={type||"text"} value={form[key]} onChange={e=>set(key,type==="number"?e.target.value:e.target.value)} style={iSty}/>}
          </div>
        ))}
        <div style={{display:"flex",gap:10,marginTop:10}}>
          <button onClick={()=>onSave({...form,totalMg:parseFloat(form.totalMg)||0,usedMg:parseFloat(form.usedMg)||0})} style={{...bSty("primary"),flex:1,padding:12}}>Save</button>
          <button onClick={onClose} style={{...bSty("outline"),flex:1,padding:12}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── DATA TAB (Body Comp + Labs) ──────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handle = async () => {
    if (pw.length < 6) { setMsg("Password must be at least 6 characters"); return; }
    if (pw !== pw2) { setMsg("Passwords do not match"); return; }
    setLoading(true);
    const { error } = await changePassword(pw);
    if (error) { setMsg(error); setLoading(false); }
    else { setSuccess(true); setTimeout(onClose, 1500); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000c",display:"flex",alignItems:"flex-end",zIndex:300}}>
      <div style={{background:"#1a1d27",borderRadius:"16px 16px 0 0",padding:24,width:"100%"}}>
        <div style={{fontFamily:"'Georgia',serif",fontSize:20,fontWeight:700,color:"#e8eaf2",marginBottom:20}}>Change Password</div>
        <input type="password" placeholder="New password" value={pw} onChange={e=>setPw(e.target.value)}
          style={{width:"100%",background:"#222636",border:"1px solid #3a4058",borderRadius:7,padding:"12px",color:"#e8eaf2",fontSize:14,marginBottom:12,outline:"none",boxSizing:"border-box"}}/>
        <input type="password" placeholder="Confirm new password" value={pw2} onChange={e=>setPw2(e.target.value)}
          style={{width:"100%",background:"#222636",border:"1px solid #3a4058",borderRadius:7,padding:"12px",color:"#e8eaf2",fontSize:14,marginBottom:16,outline:"none",boxSizing:"border-box"}}/>
        {msg && <div style={{color:"#f06060",fontSize:13,marginBottom:12}}>{msg}</div>}
        {success && <div style={{color:"#2dd4a0",fontSize:13,marginBottom:12}}>Password updated!</div>}
        <div style={{display:"flex",gap:10}}>
          <button onClick={handle} disabled={loading} style={{flex:1,background:"#2dd4a0",color:"#0f1117",border:"none",borderRadius:8,padding:12,fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:700,cursor:"pointer",opacity:loading?0.7:1}}>
            {loading?"Updating...":"Update Password"}
          </button>
          <button onClick={onClose} style={{flex:1,background:"transparent",color:"#8891aa",border:"1px solid #2a2f42",borderRadius:8,padding:12,fontFamily:"'Inter',sans-serif",fontSize:13,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DataTab({ bodyLog, labLog, onUpdateBodyLog, onUpdateLabLog }) {
  const [bTab,setBTab]=useState("body");
  const [showBodyForm,setShowBodyForm]=useState(false);
  const [showLabForm,setShowLabForm]=useState(false);
  const [bodyForm,setBodyForm]=useState({date:todayStr(),weightLbs:"",bodyFatPct:"",waistIn:"",notes:""});
  const [labForm,setLabForm]=useState({date:todayStr(),totalT:"",freeT:"",e2:"",shbg:"",hct:"",psa:"",notes:""});

  const addBody=()=>{
    onUpdateBodyLog([...bodyLog,{...bodyForm,id:`b${Date.now()}`}].sort((a,b)=>b.date.localeCompare(a.date)));
    setShowBodyForm(false);setBodyForm({date:todayStr(),weightLbs:"",bodyFatPct:"",waistIn:"",notes:""});
  };
  const addLab=()=>{
    onUpdateLabLog([...labLog,{...labForm,id:`l${Date.now()}`}].sort((a,b)=>b.date.localeCompare(a.date)));
    setShowLabForm(false);setLabForm({date:todayStr(),totalT:"",freeT:"",e2:"",shbg:"",hct:"",psa:"",notes:""});
  };

  return(
    <div style={{padding:"16px 16px 40px"}}>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["body","labs"].map(t=>(
          <button key={t} onClick={()=>setBTab(t)} style={{
            padding:"8px 18px",borderRadius:20,fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer",
            background:bTab===t?C.accent:C.surface,color:bTab===t?C.bg:C.text,
            border:`1px solid ${bTab===t?C.accent:C.border}`,
          }}>{t==="body"?"Body Comp":"Lab Results"}</button>
        ))}
      </div>

      {bTab==="body"&&(
        <>
          <button onClick={()=>setShowBodyForm(v=>!v)} style={{...bSty("primary"),marginBottom:16}}>+ Log measurement</button>
          {showBodyForm&&(
            <div style={{...card({marginBottom:16})}}>
              {[{label:"Date",key:"date",type:"date"},{label:"Weight (lbs)",key:"weightLbs",type:"number"},{label:"Body fat %",key:"bodyFatPct",type:"number"},{label:"Waist (in)",key:"waistIn",type:"number"},{label:"Notes",key:"notes"}].map(({label:lbl,key,type})=>(
                <div key={key} style={{marginBottom:12}}>
                  <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>{lbl}</span>
                  <input type={type||"text"} value={bodyForm[key]} onChange={e=>setBodyForm(f=>({...f,[key]:e.target.value}))} style={iSty}/>
                </div>
              ))}
              <button onClick={addBody} style={{...bSty("primary"),width:"100%",padding:12}}>Save</button>
            </div>
          )}
          {bodyLog.length===0
            ?<div style={{fontFamily:F.sans,fontSize:14,color:C.textMuted}}>No measurements logged yet.</div>
            :bodyLog.map(entry=>(
              <div key={entry.id} style={{...card({marginBottom:10}),display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginBottom:4}}>{entry.date}</div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                    {entry.weightLbs&&<div><div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Weight</div><div style={{fontFamily:F.sans,fontSize:18,fontWeight:700,color:C.text}}>{entry.weightLbs} <span style={{fontSize:12,color:C.textSec}}>lbs</span></div></div>}
                    {entry.bodyFatPct&&<div><div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Body fat</div><div style={{fontFamily:F.sans,fontSize:18,fontWeight:700,color:C.text}}>{entry.bodyFatPct}<span style={{fontSize:12,color:C.textSec}}>%</span></div></div>}
                    {entry.waistIn&&<div><div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted}}>Waist</div><div style={{fontFamily:F.sans,fontSize:18,fontWeight:700,color:C.text}}>{entry.waistIn}<span style={{fontSize:12,color:C.textSec}}>"</span></div></div>}
                  </div>
                  {entry.notes&&<div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginTop:6}}>{entry.notes}</div>}
                </div>
                <button onClick={()=>onUpdateBodyLog(bodyLog.filter(e=>e.id!==entry.id))} style={{background:"transparent",border:"none",color:C.textMuted,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>×</button>
              </div>
            ))
          }
        </>
      )}

      {bTab==="labs"&&(
        <>
          <button onClick={()=>setShowLabForm(v=>!v)} style={{...bSty("primary"),marginBottom:16}}>+ Log panel</button>
          {showLabForm&&(
            <div style={{...card({marginBottom:16})}}>
              {[
                {label:"Date",key:"date",type:"date"},
                {label:"Total T (ng/dL)",key:"totalT",type:"number"},
                {label:"Free T (pg/mL)",key:"freeT",type:"number"},
                {label:"E2 Estradiol (pg/mL)",key:"e2",type:"number"},
                {label:"SHBG (nmol/L)",key:"shbg",type:"number"},
                {label:"Hematocrit %",key:"hct",type:"number"},
                {label:"PSA (ng/mL)",key:"psa",type:"number"},
                {label:"Notes",key:"notes"},
              ].map(({label:lbl,key,type})=>(
                <div key={key} style={{marginBottom:12}}>
                  <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>{lbl}</span>
                  <input type={type||"text"} value={labForm[key]} onChange={e=>setLabForm(f=>({...f,[key]:e.target.value}))} style={iSty}/>
                </div>
              ))}
              <button onClick={addLab} style={{...bSty("primary"),width:"100%",padding:12}}>Save</button>
            </div>
          )}
          {labLog.length===0
            ?<div style={{fontFamily:F.sans,fontSize:14,color:C.textMuted}}>No lab results logged yet.</div>
            :labLog.map(entry=>(
              <div key={entry.id} style={{...card({marginBottom:10})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{fontFamily:F.sans,fontSize:13,fontWeight:600,color:C.text}}>{entry.date}</div>
                  <button onClick={()=>onUpdateLabLog(labLog.filter(e=>e.id!==entry.id))} style={{background:"transparent",border:"none",color:C.textMuted,cursor:"pointer",fontSize:16,padding:"2px 6px"}}>×</button>
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[["Total T",entry.totalT,"ng/dL"],["Free T",entry.freeT,"pg/mL"],["E2",entry.e2,"pg/mL"],["SHBG",entry.shbg,"nmol/L"],["HCT",entry.hct,"%"],["PSA",entry.psa,"ng/mL"]].filter(([,v])=>v).map(([name,val,unit])=>(
                    <div key={name} style={{background:C.surfaceAlt,borderRadius:7,padding:"8px 12px",minWidth:70}}>
                      <div style={{fontFamily:F.sans,fontSize:10,color:C.textMuted,marginBottom:2}}>{name}</div>
                      <div style={{fontFamily:F.sans,fontSize:16,fontWeight:700,color:name==="HCT"&&parseFloat(val)>52?C.amber:C.text}}>{val}</div>
                      <div style={{fontFamily:F.sans,fontSize:10,color:C.textMuted}}>{unit}</div>
                    </div>
                  ))}
                </div>
                {entry.notes&&<div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginTop:8}}>{entry.notes}</div>}
              </div>
            ))
          }
        </>
      )}
    </div>
  );
}

// ─── EDIT PLAN TAB ────────────────────────────────────────────────────────────
function EditPlanTab({compounds,onUpdateCompounds,cycleStart,onUpdateCycleStart}){
  const[sel,setSel]=useState(compounds[0]?.id||null);
  const c=compounds.find(x=>x.id===sel);
  const upd=updated=>onUpdateCompounds(compounds.map(x=>x.id===updated.id?updated:x));

  const addCompound=()=>{
    const id="compound-"+Date.now();
    const newC={id,name:"New Compound",status:"active",color:"#2dd4a0",vialMg:10,bacMl:1,
      doseStages:[{fromDate:todayStr(),doseMg:1}],
      dayStages:[{fromDate:todayStr(),days:[]}],
      timing:"",route:"SubQ",notes:""};
    onUpdateCompounds([...compounds,newC]);
    setSel(id);
  };

  const deleteCompound=()=>{
    if(!c) return;
    if(!window.confirm("Delete "+c.name+"?")) return;
    const remaining=compounds.filter(x=>x.id!==sel);
    onUpdateCompounds(remaining);
    setSel(remaining[0]?.id||null);
  };
  const addDoseStage=()=>upd({...c,doseStages:[...c.doseStages,{fromDate:todayStr(),doseMg:c.doseStages.at(-1)?.doseMg||1}]});
  const remDoseStage=i=>c.doseStages.length>1&&upd({...c,doseStages:c.doseStages.filter((_,idx)=>idx!==i)});
  const setDoseStage=(i,k,v)=>upd({...c,doseStages:c.doseStages.map((s,idx)=>idx===i?{...s,[k]:v}:s)});
  const addDayStage=()=>upd({...c,dayStages:[...c.dayStages,{fromDate:todayStr(),days:c.dayStages.at(-1)?.days||[]}]});
  const remDayStage=i=>c.dayStages.length>1&&upd({...c,dayStages:c.dayStages.filter((_,idx)=>idx!==i)});
  const toggleDay=(si,day)=>upd({...c,dayStages:c.dayStages.map((s,idx)=>idx===si?{...s,days:s.days.includes(day)?s.days.filter(d=>d!==day):[...s.days,day]}:s)});
  const setDayDate=(i,v)=>upd({...c,dayStages:c.dayStages.map((s,idx)=>idx===i?{...s,fromDate:v}:s)});
  const activateCompound=()=>{
    const start=todayStr();
    upd({...c,status:"active",doseStages:c.doseStages.map((s,i)=>i===0?{...s,fromDate:start}:s),dayStages:c.dayStages.map((s,i)=>i===0?{...s,fromDate:start}:s)});
  };
  return(
    <div style={{padding:"16px 16px 40px"}}>
      <div style={{...card({marginBottom:16})}}>
        <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Cycle / tracker start date</span>
        <input type="date" value={cycleStart} onChange={e=>onUpdateCycleStart(e.target.value)} style={iSty}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {compounds.map(x=>(
          <button key={x.id} onClick={()=>setSel(x.id)} style={{
            padding:"7px 14px",borderRadius:20,fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer",
            background:sel===x.id?x.color:C.surface,color:sel===x.id?C.white:C.text,
            border:`1px solid ${sel===x.id?x.color:C.border}`,opacity:x.status==="pending"?0.7:1,
          }}>{x.name}{x.status==="pending"?" ⏳":""}</button>
        ))}
        <button onClick={addCompound} style={{padding:"7px 14px",borderRadius:20,fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer",background:C.accent,color:C.bg,border:"none"}}>+ Add</button>
      </div>
      {c&&(
        <div style={{...card({})}}>
          {/* Delete button at top right */}
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={deleteCompound} style={{fontFamily:F.sans,fontSize:12,color:C.red,background:"transparent",border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 12px",cursor:"pointer"}}>Delete compound</button>
          </div>
          {c.status==="pending"&&(
            <div style={{background:C.amberLight,border:`1px solid ${C.amber}40`,borderRadius:8,padding:"12px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:F.sans,fontSize:12,fontWeight:700,color:C.amber}}>INBOUND — NOT STARTED</div>
                <div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginTop:2}}>Set start date and tap Activate when order arrives.</div>
              </div>
              <button onClick={activateCompound} style={{...bSty("primary"),padding:"7px 14px",fontSize:12}}>Activate</button>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Name</span>
            <input value={c.name} onChange={e=>upd({...c,name:e.target.value})} style={iSty}/>
          </div>
          <div style={{marginBottom:14}}>
            <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Notification time</span>
            <input type="time" value={c.notifyTime||""} onChange={e=>upd({...c,notifyTime:e.target.value})} style={iSty}/>
            {c.notifyTime && <div style={{fontFamily:F.sans,fontSize:11,color:C.accentText,marginTop:4}}>{fmt12hr(c.notifyTime)}</div>}
            <div style={{fontFamily:F.sans,fontSize:11,color:C.textMuted,marginTop:4}}>Reminder fires on scheduled days at this time</div>
          </div>

          {c.vialMg!==null&&(
            <>
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                <div style={{flex:1}}><span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Vial (mg)</span><input type="number" value={c.vialMg} onChange={e=>upd({...c,vialMg:parseFloat(e.target.value)||0})} style={iSty}/></div>
                <div style={{flex:1}}><span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>BAC water (mL)</span><input type="number" step="0.5" value={c.bacMl||""} onChange={e=>upd({...c,bacMl:parseFloat(e.target.value)||null})} style={iSty}/></div>
              </div>
              {calcRecon(c.vialMg,c.bacMl)&&(()=>{
                const r=calcRecon(c.vialMg,c.bacMl);
                const ds=activeStage(c.doseStages,todayStr());
                const u=ds?.doseMg?doseToUnits(ds.doseMg,r.mgPerMl):null;
                return<div style={{background:C.accentLight,borderRadius:7,padding:"9px 12px",fontFamily:F.sans,fontSize:12,color:C.accentText,marginBottom:14}}>
                  {r.mgPerMl.toFixed(2)} mg/mL · {r.mcgPerUnit.toFixed(0)} mcg/unit{u?` · ${ds.doseMg}mg = ${u}u`:""}
                </div>;
              })()}
            </>
          )}
          <div style={{height:1,background:C.border,margin:"4px 0 16px"}}/>
          <div style={{fontFamily:F.sans,fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>Dose stages</div>
          {c.doseStages.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <input type="date" value={s.fromDate} onChange={e=>setDoseStage(i,"fromDate",e.target.value)} style={{...iSty,flex:2}}/>
              {c.vialMg!==null
                ?<input type="number" step="0.1" placeholder="mg" value={s.doseMg??""} onChange={e=>setDoseStage(i,"doseMg",parseFloat(e.target.value)||null)} style={{...iSty,flex:1}}/>
                :<input type="number" placeholder="units" value={s.doseUnits??""} onChange={e=>setDoseStage(i,"doseUnits",parseInt(e.target.value)||null)} style={{...iSty,flex:1}}/>
              }
              {i>0&&<button onClick={()=>remDoseStage(i)} style={{background:"transparent",border:"none",color:C.red,fontSize:18,cursor:"pointer",padding:"4px 6px",flexShrink:0}}>×</button>}
            </div>
          ))}
          <button onClick={addDoseStage} style={{...bSty("outline"),fontSize:12,padding:"6px 12px",marginBottom:16}}>+ dose stage</button>
          <div style={{height:1,background:C.border,margin:"4px 0 16px"}}/>
          <div style={{fontFamily:F.sans,fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>Day change stages</div>
          {c.dayStages.map((s,si)=>(
            <div key={si} style={{marginBottom:14}}>
              {si>0&&(
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                  <input type="date" value={s.fromDate} onChange={e=>setDayDate(si,e.target.value)} style={{...iSty,flex:1}}/>
                  <button onClick={()=>remDayStage(si)} style={{background:"transparent",border:"none",color:C.red,fontSize:18,cursor:"pointer",padding:"4px 6px"}}>×</button>
                </div>
              )}
              <div style={{display:"flex",gap:5}}>
                {DAY_NAMES.map(day=>(
                  <button key={day} onClick={()=>toggleDay(si,day)} style={{
                    flex:1,padding:"8px 0",borderRadius:7,fontFamily:F.sans,fontSize:12,fontWeight:600,cursor:"pointer",
                    background:s.days.includes(day)?C.accent:C.surfaceAlt,
                    color:s.days.includes(day)?C.bg:C.textSec,
                    border:`1px solid ${s.days.includes(day)?C.accent:C.border}`,
                  }}>{day}</button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addDayStage} style={{...bSty("outline"),fontSize:12,padding:"6px 12px",marginBottom:16}}>+ day change</button>
          <div style={{height:1,background:C.border,margin:"4px 0 16px"}}/>
          <div style={{marginBottom:6}}>
            <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec,display:"block",marginBottom:5}}>Notes</span>
            <input value={c.notes} onChange={e=>upd({...c,notes:e.target.value})} style={iSty}/>
          </div>
          <div style={{fontFamily:F.sans,fontSize:12,color:C.textMuted,marginTop:10}}>Changes save automatically.</div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const today=todayStr();
  const[tab,setTab]=useState("schedule");
  const[compounds,setCompounds]=useState(null);
  const[vials,setVials]=useState(null);
  const[logs,setLogs]=useState(null);
  const[bodyLog,setBodyLog]=useState([]);
  const[labLog,setLabLog]=useState([]);
  const[cycleStart,setCycleStart]=useState("2026-01-01");
  const[loading,setLoading]=useState(true);
  const[flashSaved,setFlashSaved]=useState(false);
  const[showChangePw,setShowChangePw]=useState(false);
  const[showMenu,setShowMenu]=useState(false);

  const[user,setUser]=useState(()=>getSession()?.user||null);

  useEffect(()=>{
    if(!user){setLoading(false);return;}
    loadData(user.id).then(d=>{
      if(d){
        setCompounds(d.compounds||DEFAULT_COMPOUNDS);
        setVials(d.vials||DEFAULT_VIALS);
        setLogs(d.logs||{});
        setBodyLog(d.bodyLog||[]);
        setLabLog(d.labLog||[]);
        setCycleStart(d.cycleStart||"2026-01-01");
      } else {
        // New user — start blank, save empty state to their row
        setCompounds([]);setVials([]);setLogs({});setBodyLog([]);setLabLog([]);
        saveData({compounds:[],vials:[],logs:{},cycleStart:"2026-06-27",bodyLog:[],labLog:[]},user.id);
      }
      setLoading(false);
    });
  },[user]);

  const persist=useCallback((c,v,l,cs,bl,ll)=>{
    if(!user) return;
    saveData({compounds:c,vials:v,logs:l,cycleStart:cs,bodyLog:bl,labLog:ll},user.id)
      .then(()=>{ setFlashSaved(true); setTimeout(()=>setFlashSaved(false),2000); })
      .catch(()=>{ setFlashSaved(false); });
  },[user]);

  const markAll=useCallback((ws,allDone)=>{
    setLogs(prev=>{
      const next={...prev};
      const active=compounds.filter(c=>c.status==="active");
      for(let i=0;i<7;i++){
        const dateStr=addDays(ws,i),dayName=DAY_NAMES[parseLocal(dateStr).getDay()];
        for(const c of active){
          const stage=activeStage(c.dayStages,dateStr);
          if(!stage?.days.includes(dayName))continue;
          if(!next[c.id])next[c.id]={};else next[c.id]={...next[c.id]};
          if(allDone)delete next[c.id][dateStr];
          else next[c.id][dateStr]={time:new Date().toISOString()};
        }
      }
      persist(compounds,vials,next,cycleStart,bodyLog,labLog);
      return next;
    });
  },[compounds,vials,cycleStart,bodyLog,labLog,persist]);

  // onToggle now accepts an entry object (or null to unlog)
  const toggleLog=useCallback((cid,ds,entry)=>{
    setLogs(prev=>{
      const next={...prev,[cid]:{...(prev[cid]||{})}};
      if(entry===null||(!entry&&next[cid][ds]))delete next[cid][ds];
      else next[cid][ds]=entry||{time:new Date().toISOString()};
      persist(compounds,vials,next,cycleStart,bodyLog,labLog);
      return next;
    });
  },[compounds,vials,cycleStart,bodyLog,labLog,persist]);

  const updateVials=useCallback(v=>{setVials(v);persist(compounds,v,logs,cycleStart,bodyLog,labLog);},[compounds,logs,cycleStart,bodyLog,labLog,persist]);
  const updateCompounds=useCallback(c=>{setCompounds(c);persist(c,vials,logs,cycleStart,bodyLog,labLog);},[vials,logs,cycleStart,bodyLog,labLog,persist]);
  const updateCycleStart=useCallback(cs=>{setCycleStart(cs);persist(compounds,vials,logs,cs,bodyLog,labLog);},[compounds,vials,logs,bodyLog,labLog,persist]);
  const updateBodyLog=useCallback(bl=>{setBodyLog(bl);persist(compounds,vials,logs,cycleStart,bl,labLog);},[compounds,vials,logs,cycleStart,labLog,persist]);
  const updateLabLog=useCallback(ll=>{setLabLog(ll);persist(compounds,vials,logs,cycleStart,bodyLog,ll);},[compounds,vials,logs,cycleStart,bodyLog,persist]);

  if(!user) return <LoginScreen onLogin={(u)=>{setUser(u);}} />;
  if(loading||!compounds||!vials||!logs)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.sans,color:C.textSec}}>Loading…</div>
  );

  const TABS=[
    {id:"schedule",label:"Schedule"},
    {id:"recon",label:"Reconstitution"},
    {id:"inventory",label:"Inventory"},
    {id:"data",label:"Data"},
    {id:"editplan",label:"Edit plan"},
  ];
  const weeks=Math.max(1,Math.ceil(diffDays(cycleStart,today)/7)+1);

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F.sans,maxWidth:480,margin:"0 auto"}}>
      {/* Header */}
      <div style={{background:C.bg,padding:"20px 16px 0",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <div>
            <div style={{fontFamily:F.serif,fontSize:26,fontWeight:700,color:C.text,lineHeight:1.1}}>Stack Tracker</div>
            <div style={{fontFamily:F.sans,fontSize:12,color:C.textSec,marginTop:3}}>
              Started {fmtDateFull(cycleStart)} · {weeks} week{weeks!==1?"s":""} · tap any dose to log
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{padding:"8px 16px",borderRadius:8,fontFamily:F.sans,fontSize:13,fontWeight:600,
              background:flashSaved?C.accent:C.surfaceAlt,color:flashSaved?C.bg:C.textMuted,transition:"background 0.3s"}}>
              {flashSaved?"Saved ✓":"·"}
            </div>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowMenu(m=>!m)} style={{padding:"8px 14px",borderRadius:8,fontFamily:F.sans,fontSize:20,fontWeight:700,cursor:"pointer",background:C.surfaceAlt,color:C.textSec,border:`1px solid ${C.border}`,lineHeight:1,letterSpacing:2}}>···</button>
              {showMenu&&(
                <>
                  <div onClick={()=>setShowMenu(false)} style={{position:"fixed",inset:0,zIndex:98}}/>
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",zIndex:999,minWidth:180,boxShadow:"0 8px 30px #000a"}}>
                    <button onClick={()=>{setShowChangePw(true);setShowMenu(false);}} style={{display:"block",width:"100%",padding:"14px 16px",fontFamily:F.sans,fontSize:15,color:C.text,background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>Change Password</button>
                    <div style={{height:1,background:C.border}}/>
                    <button onClick={()=>{signOut();setUser(null);setCompounds(null);setVials(null);setLogs(null);setShowMenu(false);}} style={{display:"block",width:"100%",padding:"14px 16px",fontFamily:F.sans,fontSize:15,color:C.red,background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>Sign Out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{height:1,background:C.border,margin:"12px 0 0"}}/>
        <div style={{display:"flex",gap:8,padding:"12px 0 0",overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:"8px 16px",borderRadius:20,fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",
              background:tab===t.id?C.accent:C.surface,color:tab===t.id?C.bg:C.text,
              border:`1px solid ${tab===t.id?C.accent:C.border}`,
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:14,padding:"10px 0 12px",flexWrap:"wrap"}}>
          {compounds.filter(c=>c.status==="active").map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
              <span style={{fontFamily:F.sans,fontSize:12,color:C.textSec}}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      {tab==="schedule"&&<ScheduleTab compounds={compounds} logs={logs} onToggle={toggleLog} onMarkAll={markAll} cycleStart={cycleStart} vials={vials} user={user} onUpdateCompound={c=>updateCompounds(compounds.map(x=>x.id===c.id?c:x))}/>}
      {tab==="recon"&&<ReconTab compounds={compounds} vials={vials}/>}
      {tab==="inventory"&&<InventoryTab compounds={compounds} vials={vials} onUpdateVials={updateVials}/>}
      {tab==="data"&&<DataTab bodyLog={bodyLog} labLog={labLog} onUpdateBodyLog={updateBodyLog} onUpdateLabLog={updateLabLog}/>}
      {tab==="editplan"&&<EditPlanTab compounds={compounds} onUpdateCompounds={updateCompounds} cycleStart={cycleStart} onUpdateCycleStart={updateCycleStart}/>}

      {showChangePw && <ChangePasswordModal onClose={()=>setShowChangePw(false)}/>}
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:0;}
        input[type=number]::-webkit-inner-spin-button{opacity:1;}
        body{background:#0f1117;}
      `}</style>
    </div>
  );
}
