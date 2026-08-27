import { q } from './tmpq.mjs';
const L='7040e975-5d3c-4ab5-a3d6-4c96c914063c', U='0572e5a4-47d5-411b-8f21-86022c96fa44';
// Everyone still unowned in this league, still in the PL, not injured.
const pool = await q(`
  select p.fpl_id, p.web_name, p.club_short, p.position, p.draft_rank,
         p.total_points, p.minutes, p.ppg, p.form
    from fpl_players p
   where p.active = true and p.status = 'a'
     and (p.chance_next is null or p.chance_next >= 100)
     and (p.news is null or p.news = '')
     and p.draft_rank is not null
     and not exists (select 1 from squad_players sp
                      where sp.league_id = $1 and sp.fpl_id = p.fpl_id
                        and sp.dropped_gw is null)
   order by (case when p.minutes >= 60 then 0 else 1 end), p.draft_rank asc`, [L]);
const CAPS = { DEF: 7, MID: 5, FWD: 5 };
const out = []; const c = { DEF:0, MID:0, FWD:0 };
for (const p of pool) { if (p.position==='GK') continue; if (c[p.position] >= CAPS[p.position]) continue; c[p.position]++; out.push(p); }
const gks = pool.filter(p=>p.position==='GK').slice(0,3);
const list = [...out, ...gks];
await q('delete from draft_queues where league_id=$1 and user_id=$2',[L,U]);
let r=0; for (const p of list) { r++; await q('insert into draft_queues (league_id,user_id,fpl_id,rank) values ($1,$2,$3,$4)',[L,U,p.fpl_id,r]); }
console.log(list.map((p,i)=>`${String(i+1).padStart(2)}. ${p.web_name} (${p.club_short} ${p.position}) dr${p.draft_rank} gw1:${p.total_points}pts ${p.minutes}min`).join('\n'));
console.log(`\n${list.length} queued`);
