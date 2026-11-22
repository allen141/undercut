(() => {
  const root = document.getElementById('undercut-room');
  const field = name => root.querySelector('[data-' + name + ']');
  const panel = root.querySelector('.ur-panel');
  const button = (action, label, cls = '') => '<button type="button" class="cursor-interaction ' + cls + '" data-action="' + action + '">' + label + '</button>';
  const towns = [
    { name:'Meadow', color:'#8cbd84', goods:['Grain','Herbs'], prices:[3,4] },
    { name:'Forge', color:'#e3a375', goods:['Iron','Crystal'], prices:[9,16] },
    { name:'Harbor', color:'#89bcdd', goods:['Cloth','Tea'], prices:[6,7] }
  ];
  const state = { day:1, town:null, gold:100, phase:'travel', stock:{}, shelves:[null,null,null], served:0, revenue:0, cost:0 };
  const format = n => n + 'g';
  let lastTrigger;
  function message(text){ root.querySelector('.ur-tip').textContent=text; }
  function show(title, content){
    panel.innerHTML='<h3>' + title + '</h3>' + button('dismiss','×','ur-close') + content;
    panel.querySelector('.ur-close').setAttribute('aria-label','Close');
    panel.hidden=false;
    panel.querySelector('.ur-close').focus();
  }
  function dismiss(){ panel.hidden=true; lastTrigger?.focus(); }
  function draw(){
    field('day').textContent='Day ' + state.day;
    field('town').textContent=state.town?.name ?? 'Between towns';
    field('gold').textContent='◈ ' + format(state.gold);
    field('door').textContent=state.town ? 'Door dial' : 'Turn the dial';
    field('bell').textContent=state.phase==='open' ? (state.served<8?'Serve '+(state.served+1)+'/8':'Close shop') : state.phase==='report'?'Day’s takings':'Open shop';
    root.style.setProperty('--town',state.town?.color ?? '#7ba699');
    root.querySelector('.ur-visitor').hidden=state.phase!=='open' || state.served===8;
    root.querySelectorAll('.ur-shelf').forEach((s,i)=>{
      const slot=state.shelves[i], stock=slot ? (state.stock[slot.good]?.qty ?? 0) : 0;
      s.querySelector('[data-shelf]').textContent=slot?slot.good+' · '+format(slot.price):'Empty shelf';
      s.querySelector('.ur-goods').innerHTML='<i></i>'.repeat(Math.min(4,stock));
      s.setAttribute('aria-label','Shelf '+(i+1)+ (slot?', '+slot.good+', '+stock+' left, '+format(slot.price):', empty'));
    });
  }
  function wholesale(){
    if(state.phase!=='prepare'){message('The wholesaler opens once you choose a town.');return;}
    show('Wholesaler','<div class="ur-options">'+state.town.goods.map((good,i)=>button('buy-'+i,good+' · '+format(state.town.prices[i])+' each<small>'+ (state.stock[good]?.qty ?? 0)+' in stock</small>')).join('')+'</div>');
  }
  function shelf(i){
    if(state.phase!=='prepare'){message('Stock shelves after choosing a town and before opening.');return;}
    const goods=Object.entries(state.stock).filter(([g,s])=>s.qty && !state.shelves.some((v,j)=>v?.good===g&&i!==j));
    show('Shelf '+(i+1),goods.length?'<div class="ur-options">'+goods.map(([g,s])=>button('price-'+i+'-'+g,g+' · '+s.qty+' in stock')).join('')+'</div>':'<p>Buy stock from the wholesaler before filling this shelf.</p>');
  }
  function report(){
    show('Day’s takings','<div class="ur-figures"><span>Revenue</span><b>'+format(state.revenue)+'</b><span>Cost of goods sold</span><b>'+format(state.cost)+'</b><span>Profit</span><b>'+format(state.revenue-state.cost)+'</b></div>'+button('next','Begin day '+(state.day+1),'ur-primary'));
  }
  root.addEventListener('click', event => {
    const trigger=event.target.closest('[data-action]');
    if(!trigger || !root.contains(trigger))return;
    if(!panel.contains(trigger))lastTrigger=trigger;
    const [action,a,b,c]=trigger.dataset.action.split('-');
    if(action==='dismiss')dismiss();
    if(action==='door'){
      if(state.phase!=='travel'){message('The door is set to '+state.town.name+' for today.');return;}
      show('Turn the dial','<div class="ur-options">'+towns.map((t,i)=>button('town-'+i,t.name+'<small>'+t.goods.map((g,j)=>g+' '+format(t.prices[j])).join(' · ')+'</small>')).join('')+'</div>');
    }
    if(action==='town'){state.town=towns[Number(a)];state.phase='prepare';dismiss();message('Buy stock at the counter, then tap a shelf to price it.');}
    if(action==='crate')wholesale();
    if(action==='buy'){
      const good=state.town.goods[Number(a)], price=state.town.prices[Number(a)];
      if(state.gold<price){message('Not enough gold.');return;}
      const stock=state.stock[good]??={qty:0,unit:price};stock.qty++;state.gold-=price;
      message('Bought '+good+' for '+format(price)+'.');wholesale();
    }
    if(action==='shelf')shelf(Number(a));
    if(action==='price'){
      const base=state.stock[b].unit;
      show('Price '+b,'<div class="ur-options">'+[base+1,base+3,base+5].map(price=>button('set-'+a+'-'+b+'-'+price,format(price))).join('')+'</div>');
    }
    if(action==='set'){state.shelves[Number(a)]={good:b,price:Number(c)};dismiss();message('Set '+b+' to '+format(Number(c))+'.');}
    if(action==='book'){
      if(state.phase==='report')report();
      else show('Ledger','<div class="ur-figures"><span>Gold in till</span><b>'+format(state.gold)+'</b><span>Sales today</span><b>'+format(state.revenue)+'</b></div>');
    }
    if(action==='bell'){
      if(state.phase==='travel'){message('Choose a town before opening.');return;}
      if(state.phase==='prepare'){state.phase='open';message('Your first customer is at the counter.');}
      else if(state.phase==='open'&&state.served<8){
        const slot=state.shelves[state.served%3];state.served++;
        const stock=slot&&state.stock[slot.good];
        if(stock?.qty&&slot.price<=stock.unit+3){stock.qty--;state.gold+=slot.price;state.revenue+=slot.price;state.cost+=stock.unit;message('Sold '+slot.good+' for '+format(slot.price)+'.');}
        else message('The customer left without buying.');
      }else{state.phase='report';report();}
    }
    if(action==='next'){state.day++;state.town=null;state.phase='travel';state.served=state.revenue=state.cost=0;dismiss();message('Turn the dial to choose today’s town.');}
    draw();
  });
  root.addEventListener('keydown', e => {if(e.key==='Escape'&&!panel.hidden)dismiss();});
  draw();
})();
