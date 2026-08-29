"use client";
import { useState } from "react";
export function DemoEntry({role,label}:{role:"citizen"|"operator";label:string}){const [loading,setLoading]=useState(false);const enter=async()=>{setLoading(true);const r=await fetch("/api/auth/demo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})});const data=await r.json();if(data.redirect)location.href=data.redirect;else setLoading(false);};return <button className={role==="operator"?"btn secondary":"btn"} onClick={enter} disabled={loading}>{loading?"Opening secure demo…":label}</button>}
