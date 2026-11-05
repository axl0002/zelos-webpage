/** Country flags are omitted for unknown countries, matching athlete identity elsewhere. */
export function countryFlag(country:string|null|undefined){const code=country?.trim().toUpperCase();return code&&/^[A-Z]{2}$/.test(code)&&code!=='ZZ'&&code!=='XX'?String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0))):'';}
export default function AthleteIdentity({username,country}:{username:string;country:string|null|undefined}){const flag=countryFlag(country);return <span>{flag&&<span aria-hidden="true">{flag} </span>}{username||'Unnamed account'}</span>;}
