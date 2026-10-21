/* BATA KADE client review API: no network, no actual payments, no shared database. */
(function(){
  "use strict";
  const MENU = [{"code":"101","name":"Chicken Rice & Curry","price":280,"category":"Rice & Curry","meals":["breakfast"],"sort":1,"active":true},{"code":"102","name":"Fish Rice & Curry","price":230,"category":"Rice & Curry","meals":["breakfast"],"sort":2,"active":true},{"code":"103","name":"Egg Rice & Curry","price":230,"category":"Rice & Curry","meals":["breakfast"],"sort":3,"active":true},{"code":"104","name":"Vegetable Rice & Curry","price":180,"category":"Rice & Curry","meals":["breakfast"],"sort":4,"active":true},{"code":"111","name":"String Hoppers - 10 pcs","price":120,"category":"String Hoppers","meals":["breakfast"],"sort":5,"active":true},{"code":"112","name":"String Hoppers - 15 pcs","price":160,"category":"String Hoppers","meals":["breakfast"],"sort":6,"active":true},{"code":"113","name":"String Hoppers - 20 pcs","price":200,"category":"String Hoppers","meals":["breakfast"],"sort":7,"active":true},{"code":"124","name":"Bread 1/2 + Gravy","price":220,"category":"Bread","meals":["breakfast"],"sort":8,"active":true},{"code":"126","name":"Milk Rice - 1 Piece","price":100,"category":"Other Foods","meals":["breakfast"],"sort":9,"active":true},{"code":"127","name":"Noodles","price":160,"category":"Other Foods","meals":["breakfast"],"sort":10,"active":true},{"code":"121","name":"Parata Roti","price":60,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":11,"active":true},{"code":"122","name":"Egg Roti","price":80,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":12,"active":true},{"code":"211","name":"Egg Rolls","price":100,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":13,"active":true},{"code":"212","name":"Fish Rolls","price":100,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":14,"active":true},{"code":"213","name":"Vegetable Roti","price":80,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":15,"active":true},{"code":"214","name":"Wadei","price":30,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":16,"active":true},{"code":"215","name":"Ulundu Wadei","price":60,"category":"Short Eats","meals":["breakfast","lunch","dinner"],"sort":17,"active":true},{"code":"204","name":"Plain Tea","price":50,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":18,"active":true},{"code":"202","name":"Milk Tea","price":100,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":19,"active":true},{"code":"205","name":"Plain Coffee","price":60,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":20,"active":true},{"code":"206","name":"Milk Coffee","price":130,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":21,"active":true},{"code":"203","name":"Nestomalt","price":120,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":22,"active":true},{"code":"207","name":"Nescafe","price":120,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":23,"active":true},{"code":"208","name":"Milo","price":120,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":24,"active":true},{"code":"209","name":"Soft Drink - Buddy","price":100,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":25,"active":true},{"code":"210","name":"Soft Drink - Medium","price":120,"category":"Beverages","meals":["breakfast","lunch","dinner"],"sort":26,"active":true},{"code":"301","name":"Chicken Rice & Curry","price":350,"category":"Rice & Curry","meals":["lunch","dinner"],"sort":27,"active":true},{"code":"302","name":"Fish Rice & Curry","price":250,"category":"Rice & Curry","meals":["lunch","dinner"],"sort":28,"active":true},{"code":"303","name":"Egg Rice & Curry","price":250,"category":"Rice & Curry","meals":["lunch","dinner"],"sort":29,"active":true},{"code":"304","name":"Vegetable Rice & Curry","price":200,"category":"Rice & Curry","meals":["lunch","dinner"],"sort":30,"active":true},{"code":"311","name":"Egg Fried Rice - Half","price":300,"category":"Fried Rice","meals":["lunch","dinner"],"sort":31,"active":true},{"code":"312","name":"Egg Fried Rice - Full","price":500,"category":"Fried Rice","meals":["lunch","dinner"],"sort":32,"active":true},{"code":"313","name":"Chicken Fried Rice - Half","price":350,"category":"Fried Rice","meals":["lunch","dinner"],"sort":33,"active":true},{"code":"314","name":"Chicken Fried Rice - Full","price":600,"category":"Fried Rice","meals":["lunch","dinner"],"sort":34,"active":true},{"code":"315","name":"Mix Fried Rice - Half","price":500,"category":"Fried Rice","meals":["lunch","dinner"],"sort":35,"active":true},{"code":"316","name":"Mix Fried Rice - Full","price":700,"category":"Fried Rice","meals":["lunch","dinner"],"sort":36,"active":true},{"code":"317","name":"Biriyani","price":450,"category":"Other Foods","meals":["lunch","dinner"],"sort":37,"active":true},{"code":"321","name":"Egg Kottu - Half","price":400,"category":"Kottu","meals":["lunch","dinner"],"sort":38,"active":true},{"code":"322","name":"Egg Kottu - Full","price":600,"category":"Kottu","meals":["lunch","dinner"],"sort":39,"active":true},{"code":"323","name":"Chicken Kottu - Half","price":450,"category":"Kottu","meals":["lunch","dinner"],"sort":40,"active":true},{"code":"324","name":"Chicken Kottu - Full","price":650,"category":"Kottu","meals":["lunch","dinner"],"sort":41,"active":true},{"code":"110","name":"String Hoppers - 1 pc","price":0,"category":"String Hoppers","meals":["breakfast"],"sort":42,"active":false},{"code":"123","name":"Bread 1/4","price":0,"category":"Bread","meals":["breakfast"],"sort":43,"active":false},{"code":"125","name":"Bread - Full","price":0,"category":"Bread","meals":["breakfast"],"sort":44,"active":false},{"code":"201","name":"Egg (Extra)","price":0,"category":"Extras & Drinks","meals":["breakfast","lunch","dinner"],"sort":45,"active":false}];
  const STORAGE_KEY = 'bata_kade_preview_orders_v2_customer_menu';
  let fallback = [];
  function load(){
    try{const val=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(val)?val.slice(0,50):[];}
    catch(e){return fallback;}
  }
  function save(orders){
    fallback=orders.slice(0,50);
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(fallback));}catch(e){}
  }
  function failure(message){return Promise.reject(new Error(message));}
  window.BataDemoAPI = async function(path,method='GET',body=null){
    if(path==='/api/state' && method==='GET')return {items:MENU.map(x=>({...x})),demo_mode:true,admin_configured:true,admin_logged_in:false,orders:load().slice(0,12),sales:{count:0,total:0}};
    if(path==='/api/orders' && method==='GET')return {orders:load()};
    if(path==='/api/orders' && method==='POST'){
      if(!body||!Array.isArray(body.items)||!body.items.length)return failure('Add at least one food.');
      if(!['Takeaway','Dine-in'].includes(body.service))return failure('Invalid order type.');
      if(!['Cash','Card','QR'].includes(body.payment))return failure('Invalid payment method.');
      const old=load();
      const duplicate=old.find(x=>x.key===body.key);
      if(duplicate)return {order:duplicate,duplicate:true};
      const counts={};
      for(const line of body.items){
        if(!line||!/^[0-9]{3}$/.test(String(line.code))||!Number.isSafeInteger(line.qty)||line.qty<1||line.qty>999)return failure('Invalid food or quantity.');
        const food=MENU.find(x=>x.code===line.code && x.active);
        if(!food)return failure('Food code unavailable.');
        counts[food.code]=(counts[food.code]||0)+line.qty;
        if(counts[food.code]>999)return failure('Quantity too large.');
      }
      const lines=Object.entries(counts).map(([code,qty])=>{
        const food=MENU.find(x=>x.code===code);
        return {code,name:food.name,price:food.price,qty,line_total:qty*food.price};
      });
      const total=lines.reduce((sum,row)=>sum+row.line_total,0);
      const received=body.payment==='Cash'?Number(body.cash_received):0;
      if(body.payment==='Cash'&&(!Number.isSafeInteger(received)||received<total))return failure('Insufficient demo cash received.');
      const now=new Date();
      const created_at=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',dateStyle:'short',timeStyle:'short'}).format(now);
      const order={id:old.length?Math.max(...old.map(o=>o.id))+1:1,key:body.key||null,created_at,
        service:body.service,table_no:String(body.table_no||'').slice(0,10),payment:body.payment,
        cash_received:received,change_due:body.payment==='Cash'?received-total:0,total,
        is_demo:true,status:'Completed',lines};
      save([order,...old]);
      return {order,duplicate:false};
    }
    return failure('Owner management and live operations are not available in the customer UI preview.');
  };
})();
