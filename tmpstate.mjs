import { q } from './tmpq.mjs';
const L='7040e975-5d3c-4ab5-a3d6-4c96c914063c', U='0572e5a4-47d5-411b-8f21-86022c96fa44';
const league = await q('select draft_status, current_pick from leagues where id=$1',[L]);
console.log('league:', JSON.stringify(league));
const mine = await q(`select p.web_name, p.position from squad_players sp join squads s on s.id=sp.squad_id join fpl_players p on p.fpl_id=sp.fpl_id where s.league_id=$1 and s.user_id=$2 and sp.dropped_gw is null`,[L,U]);
console.log('my squad:', mine.map(m=>`${m.web_name}(${m.position})`).join(', ') || 'none');
const taken = await q('select count(*) as n from squad_players where league_id=$1 and dropped_gw is null',[L]);
console.log('taken overall:', taken[0].n);
