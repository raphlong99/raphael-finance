-- One-off import of Raphael's numbers into his account. Run after his first sign-in.
-- Uses the service role (bypasses RLS). Safe to run once; it skips if accounts already exist.
do $$
declare
  uid uuid;
  a_uob uuid; a_ideal uuid; a_spend uuid; a_tiger uuid; a_aia uuid;
  b_ef uuid; b_centre uuid; b_home uuid; b_tiger uuid; b_aia uuid;
  r_tax uuid; r_needs uuid; r_aia uuid; r_tiger uuid; r_fun uuid; r_save uuid;
begin
  select id into uid from auth.users
   where email in ('longraphaeljames@gmail.com','raphlong99@gmail.com') order by created_at limit 1;
  if uid is null then raise exception 'Raphael has not signed in yet'; end if;
  if exists (select 1 from public.accounts where user_id = uid) then raise notice 'Already imported'; return; end if;

  update public.profiles set display_name='Raphael', birth_month='1999-09-01', currency='SGD',
    income_estimate=6000, income_growth=5, seasonal='{"11":-15,"12":-15}', cost_growth=2, cash_rate=2,
    earner_type='freelancer', template='freelancer', onboarded=true
  where id = uid;

  insert into public.accounts(user_id,name,institution,kind,sort,notes) values (uid,'UOB savings','UOB','cash',1,'Emergency fund, then tuition centre, then home') returning id into a_uob;
  insert into public.accounts(user_id,name,institution,kind,sort,notes) values (uid,'DBS IDEAL','DBS','cash',2,'Raphael Tuition business account; tax + MediSave set aside here') returning id into a_ideal;
  insert into public.accounts(user_id,name,institution,kind,sort,notes) values (uid,'DBS spending','DBS','cash',3,'Needs and investing transfers') returning id into a_spend;
  insert into public.accounts(user_id,name,institution,kind,sort,notes) values (uid,'Tiger Brokers','Tiger','brokerage',4,'VOO + ES3') returning id into a_tiger;
  insert into public.accounts(user_id,name,institution,kind,sort,notes) values (uid,'AIA Pro Achiever','AIA','ilp',5,'Policy U125702351. Surrender value is far below fund value until year 13.') returning id into a_aia;

  -- Reuse the default emergency fund bucket made at sign-up.
  select id into b_ef from public.buckets where user_id = uid and name = 'Emergency fund' limit 1;
  if b_ef is null then
    insert into public.buckets(user_id,name,kind,fill_order,color) values (uid,'Emergency fund','savings',1,'teal') returning id into b_ef;
  end if;
  update public.buckets set target=12000, fill_order=1, color='teal', account_id=a_uob, notes='6 months of core costs; raise to S$18k until disability cover is in force' where id=b_ef;
  insert into public.buckets(user_id,name,kind,target,fill_order,color,account_id) values (uid,'Tuition centre fund','savings',70000,2,'amber',a_uob) returning id into b_centre;
  insert into public.buckets(user_id,name,kind,target,fill_order,color,account_id) values (uid,'Home & future','savings',50000,3,'green',a_uob) returning id into b_home;
  insert into public.buckets(user_id,name,kind,fill_order,color,expected_return,account_id) values (uid,'Tiger (VOO + ES3)','investment',10,'blue',7,a_tiger) returning id into b_tiger;
  insert into public.buckets(user_id,name,kind,fill_order,color,expected_return,account_id,notes) values (uid,'AIA Pro Achiever','investment',11,'rose',3,a_aia,'Net return after charges until year 13') returning id into b_aia;

  delete from public.split_rules where user_id = uid;
  insert into public.split_rules(user_id,name,kind,value,round_mode,round_to,category,sort) values (uid,'Tax + MediSave','percent',12,'up',10,'tax',10) returning id into r_tax;
  insert into public.split_rules(user_id,name,kind,round_mode,round_to,category,sort) values (uid,'Needs','expenses','up',50,'needs',20) returning id into r_needs;
  insert into public.split_rules(user_id,name,kind,value,bucket_id,category,sort) values (uid,'AIA Pro Achiever','fixed',300,b_aia,'invest',30) returning id into r_aia;
  insert into public.split_rules(user_id,name,kind,value,bucket_id,category,sort) values (uid,'Tiger','fixed',700,b_tiger,'invest',40) returning id into r_tiger;
  insert into public.split_rules(user_id,name,kind,value,round_mode,round_to,category,sort) values (uid,'Fun','percent',8,'down',10,'fun',50) returning id into r_fun;
  insert into public.split_rules(user_id,name,kind,round_mode,round_to,category,sort) values (uid,'Savings','remainder','down',50,'save',99) returning id into r_save;

  insert into public.expense_items(user_id,name,monthly,in_force,sort) values
    (uid,'Living expenses',1000,true,1),(uid,'Phone',20,true,2),(uid,'Claude',150,true,3),(uid,'Anytime Fitness',91,true,4),
    (uid,'Transport',122,true,5),(uid,'Insurance (GPP, hospital rider, PA)',203,true,6),(uid,'Term early CI ($200k to 75, estimate)',130,false,7);

  insert into public.balances(user_id,account_id,as_of,value,note) values
    (uid,a_uob,'2026-11-03',4500,'After renovation and last month''s bills'),
    (uid,a_tiger,'2026-11-03',1370,'VOO 1.23467 sh, ES3 49 units, 1 Xiaomi share'),
    (uid,a_aia,'2026-11-03',11551.33,'Fund value; surrender value S$2,310.27');

  insert into public.holdings(user_id,account_id,symbol,name,market,currency,qty,avg_cost,last_price,as_of) values
    (uid,a_tiger,'VOO','Vanguard S&P 500 ETF','US','USD',1.23467,701.40,690.67,'2026-11-03'),
    (uid,a_tiger,'ES3','SPDR STI ETF','SG','SGD',49,5.683,5.353,'2026-11-03'),
    (uid,a_tiger,'01810','Xiaomi','HK','HKD',1,0.01,28.56,'2026-11-03');

  insert into public.months(user_id,month,income,is_estimate,notes,split) values
   (uid,'2026-09-01',6682,false,null, jsonb_build_array(
     jsonb_build_object('rule_id',r_tax,'name','Tax + MediSave','category','tax','amount',810,'bucket_id',null),
     jsonb_build_object('rule_id',r_needs,'name','Needs','category','needs','amount',1600,'bucket_id',null),
     jsonb_build_object('rule_id',r_aia,'name','AIA Pro Achiever','category','invest','amount',300,'bucket_id',b_aia),
     jsonb_build_object('rule_id',r_tiger,'name','Tiger','category','invest','amount',700,'bucket_id',b_tiger),
     jsonb_build_object('rule_id',r_fun,'name','Fun','category','fun','amount',530,'bucket_id',null),
     jsonb_build_object('rule_id',r_save,'name','Savings','category','save','amount',2700,'bucket_id',null))),
   (uid,'2026-10-01',7012.5,false,'Fun skipped this month', jsonb_build_array(
     jsonb_build_object('rule_id',r_tax,'name','Tax + MediSave','category','tax','amount',850,'bucket_id',null),
     jsonb_build_object('rule_id',r_needs,'name','Needs','category','needs','amount',1600,'bucket_id',null),
     jsonb_build_object('rule_id',r_aia,'name','AIA Pro Achiever','category','invest','amount',300,'bucket_id',b_aia),
     jsonb_build_object('rule_id',r_tiger,'name','Tiger','category','invest','amount',700,'bucket_id',b_tiger),
     jsonb_build_object('rule_id',r_fun,'name','Fun','category','fun','amount',0,'bucket_id',null),
     jsonb_build_object('rule_id',r_save,'name','Savings','category','save','amount',3550,'bucket_id',null)));

  insert into public.policies(user_id,insurer,name,kind,premium,frequency,paid_via,next_due,cover,in_force,notes,sort) values
   (uid,'AIA','Guaranteed Protect Plus (II)','life',76.47,'monthly','GIRO','2026-12-09',
    '[{"type":"Death","amount":30000,"until":"2099-12-09"},{"type":"Death booster","amount":30000,"until":"2064-12-09"},{"type":"Early CI","amount":30000,"until":"2099-12-09"},{"type":"Early CI booster","amount":30000,"until":"2064-12-09"},{"type":"TPD","amount":30000,"until":"2069-12-09"},{"type":"TPD booster","amount":30000,"until":"2064-12-09"}]',
    true,'Whole life, participating. Vested bonus S$1,219.36. No beneficiary nominated yet.',1),
   (uid,'AIA','HealthShield Gold Max A','hospital',680.83,'annual','MediSave + GIRO (POSB)','2026-12-08',
    '[{"type":"Hospital (private standard room)","amount":1000000,"until":"2099-12-08","note":"Annual limit"}]',true,'Includes MediShield Life. Check the cash top-up before 8 Dec.',2),
   (uid,'AIA','HSG Max Rider (VitalHealth A + Cancer Care Booster)','hospital',107.30,'monthly','GIRO (POSB)','2026-12-08','[]',true,'Co-payment rider and cancer booster on HealthShield.',3),
   (uid,'AIA','Solitaire PA (II)','pa',19.50,'monthly','GIRO','2026-12-08',
    '[{"type":"Accidental death","amount":200000,"until":"2079-12-08","note":"S$100k + S$100k additional payout"},{"type":"Accidental TPD","amount":300000,"until":"2079-12-08"},{"type":"Accident medical","amount":2000,"until":"2079-12-08"}]',true,null,4),
   (uid,'AIA','Pro Achiever (ILP)','ilp',300,'monthly','GIRO','2026-12-09','[]',true,'Investment with minimal protection. Supplementary charges until year 13.',5),
   (uid,'TBC','Term early CI, S$200k to 75','ci',130,'monthly',null,null,'[{"type":"Early CI","amount":200000,"until":"2074-09-12"}]',false,'Planned. Premium is an estimate until a quote comes in.',6);
end $$;
