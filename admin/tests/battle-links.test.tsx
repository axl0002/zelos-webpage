import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import Battle,{generateMetadata} from '../src/app/battle/[id]/page';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not found');}}));
afterEach(cleanup);
const id='00000000-0000-4000-8000-000000000001';
it('shares a stable battle destination with app/store fallbacks and no athlete/media exposure',async()=>{
 render(await Battle({params:Promise.resolve({id})}));
 expect(screen.getByRole('link',{name:'Open in Zelos'}).getAttribute('href')).toBe(`club.zelos.app://battle/${id}`);
 expect(screen.getByRole('link',{name:'Download on the App Store'})).toBeTruthy();expect(screen.getByRole('link',{name:'Get it on Google Play'})).toBeTruthy();
 const meta=await generateMetadata({params:Promise.resolve({id})});expect(meta.alternates?.canonical).toBe(`https://zelos.club/battle/${id}`);expect(meta.other?.['apple-itunes-app']).toContain(`/battle/${id}`);
 expect(document.querySelector('video')).toBeNull();
});
it.each(['bad','<script>','../profile','00000000-0000-4000-8000-000000000001/extra'])('rejects malformed battle identifiers: %s',async id=>{await expect(Battle({params:Promise.resolve({id})})).rejects.toThrow('not found');});
