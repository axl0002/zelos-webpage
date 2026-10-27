// Isolated visual fixture. Every fetch is intercepted; no backend is contacted.
import React from "react";
import {createRoot} from "react-dom/client";
import Dashboard from "../../src/components/admin-analytics-dashboard";
import {analyticsFixture} from "./analytics";
import "../../src/app/admin/globals.css";
window.fetch=async(input)=>{
  const url=new URL(String(input),location.href);
  if(url.pathname!=="/admin/api/analytics")throw new Error("Network disabled in this fixture");
  return new Response(JSON.stringify(analyticsFixture(Number(url.searchParams.get("days")),url.searchParams.get("tz")??"UTC")),{headers:{"content-type":"application/json"}});
};
createRoot(document.getElementById("root")!).render(<div className="workspace"><aside className="sidebar"><a className="brand" href="#">zelos<span> / admin</span></a><nav className="admin-navigation" aria-label="Admin navigation">{["Exercise review","Ranked uploads","Ranking flags","User reports","Upload safety","Users","Scoring lab","Feed lab","Analytics"].map(label=><a key={label} className={`nav-item${label==="Analytics"?" active":""}`} href="#">{label}</a>)}</nav></aside><main className="main"><Dashboard/></main></div>);
