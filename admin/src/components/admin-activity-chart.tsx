"use client";
import {useId,useState} from "react";
const number = new Intl.NumberFormat("en-US");
function dateLabel(value:string,long=false){return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",...(long?{year:"numeric"}:{}),timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"));}
export default function ActivityChart<K extends string>({title,description,rows,series,stacked=false}: {title:string;description:string;rows:({date:string} & Record<K,number>)[];series:{key:K;label:string;color:string}[];stacked?:boolean}) {
  const id=useId(), [selected,setSelected]=useState(rows.length-1), current=rows[Math.min(selected,rows.length-1)];
  const max=Math.max(1,...rows.map(row=>stacked ? series.reduce((n,s)=>n+row[s.key],0) : Math.max(...series.map(s=>row[s.key]))));
  const ceiling=max<=5 ? 5 : Math.ceil(max/5)*5;
  const width=680,height=225,left=45,right=12,top=16,bottom=36,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const x=(i:number)=>left+(i+.5)*plotWidth/rows.length, y=(v:number)=>top+plotHeight*(1-v/ceiling);
  return <section className="analytics-chart-card" aria-labelledby={id+"-heading"}>
    <header><h2 id={id+"-heading"}>{title}</h2><p className="muted small">{description}</p></header>
    <div className="analytics-chart-legend">{series.map(s=><span key={s.key}><i style={{background:s.color}} aria-hidden="true"/>{s.label}</span>)}</div>
    <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-labelledby={id+"-heading"} aria-describedby={id+"-help "+id+"-readout"}
      onKeyDown={event=>{const key=event.key;if (!["ArrowLeft","ArrowRight","Home","End"].includes(key))return;event.preventDefault();setSelected(i=>key==="Home"?0:key==="End"?rows.length-1:Math.max(0,Math.min(rows.length-1,i+(key==="ArrowRight"?1:-1))));}}>
      {[0,Math.ceil(ceiling/2),ceiling].map(tick=><g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#e8ebf0" strokeDasharray="3 4"/><text x={left-9} y={y(tick)+4} textAnchor="end">{number.format(tick)}</text></g>)}
      {stacked ? rows.map((row,i)=>{let base=0;return <g key={row.date}>{series.map(s=>{const value=row[s.key],previous=base;base+=value;return <rect key={s.key} x={x(i)-Math.min(18,plotWidth/rows.length*.35)} y={y(base)} width={Math.min(36,plotWidth/rows.length*.7)} height={Math.max(0,y(previous)-y(base))} fill={s.color} rx={2}><title>{dateLabel(row.date,true)} · {s.label}: {number.format(value)}</title></rect>;})}</g>;}) : series.map(s=><polyline key={s.key} points={rows.map((row,i)=>`${x(i)},${y(row[s.key])}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round"/>)}
      <line x1={x(Math.min(selected,rows.length-1))} x2={x(Math.min(selected,rows.length-1))} y1={top} y2={height-bottom} stroke="#9ca3af" strokeDasharray="3 4"/>
      {rows.map((row,i)=><rect key={row.date} x={left+i*plotWidth/rows.length} y={top} width={plotWidth/rows.length} height={plotHeight} fill="transparent" onPointerEnter={()=>setSelected(i)}><title>{dateLabel(row.date,true)} · {series.map(s=>`${s.label}: ${number.format(row[s.key])}`).join(" · ")}</title></rect>)}
      {[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])].map(i=><text key={i} x={x(i)} y={height-10} textAnchor={i===0?"start":i===rows.length-1?"end":"middle"}>{dateLabel(rows[i].date)}</text>)}
    </svg>
    <p id={id+"-help"} className="sr-only">Use left and right arrow keys to inspect days. Exact values are also in the daily breakdown table.</p>
    <div id={id+"-readout"} className="analytics-chart-readout"><strong>{dateLabel(current.date)}</strong>{series.map(s=><span key={s.key}>{s.label} <b>{number.format(current[s.key])}</b></span>)}</div>
  </section>;
}
