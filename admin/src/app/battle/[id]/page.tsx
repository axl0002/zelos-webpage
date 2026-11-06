import type {Metadata} from "next";
import {notFound} from "next/navigation";
type Props={params:Promise<{id:string}>};
const valid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const title="Watch and vote on a battle in Zelos";
const description="Open the matchup, watch every round and vote for the overall winner in Zelos.";
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {id}=await params;if(!valid.test(id))return {title:"Battle – Zelos",robots:{index:false}};
 const url=`https://zelos.club/battle/${id.toLowerCase()}`;
 return {title,description,robots:{index:false,follow:false},alternates:{canonical:url},openGraph:{title,description,url,type:"website"},other:{"apple-itunes-app":`app-id=6751625048, app-argument=${url}`},icons:{icon:"/assets/z_app_icon.png"}};
}
export default async function SharedBattle({params}:Props){
 const {id}=await params;if(!valid.test(id))notFound();
 return <><link rel="stylesheet" href="/styles.css"/><nav className="nav-bar" aria-label="Main navigation"><div className="nav-container"><a href="https://zelos.club" className="nav-logo" aria-label="Zelos home"><img src="/assets/z_app_icon.png" className="logo-img" alt="Zelos"/></a></div></nav>
 <main className="document-page legal-page"><header className="page-header"><h1 className="page-title shared-profile-title">{title}</h1><p className="page-intro">{description}</p></header>
 <section className="document-card shared-profile-actions"><a className="btn-primary profile-open-button" href={`club.zelos.app://battle/${id.toLowerCase()}`}>Open in Zelos</a><p>Install or update Zelos, then tap the battle link again. Sign in to watch and vote.</p><div className="cta-buttons"><a className="store-badge" href="https://apps.apple.com/gb/app/zelos/id6751625048" aria-label="Download on the App Store"><img src="/assets/app-store-badge.svg" alt="Download on the App Store" width="156" height="52"/></a><a className="store-badge" href="https://play.google.com/store/apps/details?id=club.zelos.app" aria-label="Get it on Google Play"><img src="/assets/google-play-badge.svg" alt="Get it on Google Play" width="175.5" height="52"/></a></div></section></main></>;
}
