-- Seed data. EVERYTHING here is demonstration data and is flagged is_demo where the schema allows.
-- Pocket Budget is an illustrative product configured purely through data: nothing about it is
-- hardcoded in the application. No tester feedback, sessions, bugs or verdicts are seeded — those
-- only ever come from real use, so dashboards start honestly empty.
--
-- Demo sign-ins (development only — change or remove before any real deployment):
--   creator@demo.fromsavetobuild.test / demo-password-1     (owns Pocket Budget)
--   tester@demo.fromsavetobuild.test  / demo-password-1     (beginner demo tester, draft application)
--   tester2@demo.fromsavetobuild.test / demo-password-1     (blank second tester)

do $$
declare
  u_creator uuid := '00000000-0000-4000-a000-000000000001';
  u_tester  uuid := '00000000-0000-4000-a000-000000000002';
  u_tester2 uuid := '00000000-0000-4000-a000-000000000003';
  p_pocket  uuid := '10000000-0000-4000-a000-000000000001';
  rel_pocket uuid := '11000000-0000-4000-a000-000000000001';
  rnd_pocket uuid := '12000000-0000-4000-a000-000000000001';
  p_focus   uuid := '10000000-0000-4000-a000-000000000002';
  rel_focus uuid := '11000000-0000-4000-a000-000000000002';
  rnd_focus uuid := '12000000-0000-4000-a000-000000000002';
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; f1 uuid; f2 uuid;
  usr record;
begin
  -- ---------------------------------------------------------------- demo accounts
  for usr in select * from (values
      (u_creator, 'creator@demo.fromsavetobuild.test', 'Pocket Budget Team (demo)'),
      (u_tester,  'tester@demo.fromsavetobuild.test',  'Demo Tester'),
      (u_tester2, 'tester2@demo.fromsavetobuild.test', 'Second Demo Tester')) as t(id, email, name) loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (usr.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', usr.email,
      crypt('demo-password-1', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', usr.name, 'is_demo', true), now(), now())
    on conflict (id) do nothing;
    -- Hosted Supabase only (these objects do not exist in the local dev shim).
    if to_regclass('auth.identities') is not null then
      execute 'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, jsonb_build_object(''sub'', $1::text, ''email'', $2), ''email'', now(), now(), now())
               on conflict do nothing' using usr.id, usr.email;
      execute 'update auth.users set confirmation_token = '''', recovery_token = '''', email_change = '''', email_change_token_new = ''''
               where id = $1' using usr.id;
    end if;
  end loop;

  update profiles set bio = 'Demonstration creator account for the Pocket Budget example.', country = 'AE', is_demo = true where id = u_creator;
  update profiles set bio = 'Demonstration profile: a beginner who wants to understand where their money goes.',
    country = 'AE', devices = array['iphone'], is_demo = true where id = u_tester;
  update profiles set country = 'AE', devices = array['android'], is_demo = true where id = u_tester2;

  -- ---------------------------------------------------------------- Pocket Budget
  insert into products (id, creator_id, name, description, category, stage, stage_label, target_audience, demo_url, is_demo)
  values (p_pocket, u_creator, 'Pocket Budget',
    'A beginner-friendly personal budgeting application that helps users track expenses, organise spending categories, create monthly budgets and understand their spending habits.',
    'finance', 'beta', 'Beta prototype',
    'People who are new to budgeting and want a simple way to see where their money goes.',
    'https://example.com/pocket-budget-demo', true);

  insert into product_releases (id, product_id, version, notes, access_url, access_instructions)
  values (rel_pocket, p_pocket, 'v0.8.2', 'Beta prototype used for the first structured testing round.',
    'https://example.com/pocket-budget-demo',
    'Open the demo link on your phone. The app is pre-loaded with sample (synthetic) transactions in AED. Never enter real bank details.');

  insert into product_assets (product_id, kind, url, caption, sort_order) values
    (p_pocket, 'demo_link', 'https://example.com/pocket-budget-demo', 'Interactive demo (illustrative link)', 0);

  insert into testing_rounds (id, product_id, release_id, round_number, title, status, summary, target_audience, cohort_size,
    expected_minutes_min, expected_minutes_max, supported_devices, countries, application_deadline, testing_deadline,
    reward_type, reward_details, privacy_requirements, beginner_friendly, instructions, access_instructions, support_contact,
    application_form, published_at)
  values (rnd_pocket, p_pocket, rel_pocket, 1, 'Pocket Budget beta test', 'published',
    'You will try Pocket Budget the way a new user would: look around the dashboard, set a monthly budget of AED 4,000, add two everyday expenses, read the spending insights and fix a mistake in a transaction. After each task you tell us how it went. Everything uses sample data.',
    'Beginners and occasional budgeters living in the UAE.', 20, 20, 30,
    array['iphone','android'], array['AE'], now() + interval '30 days', now() + interval '45 days',
    'unpaid', 'Unpaid. You get early access and a testing credit on your From Save to Build profile.',
    'Use only the sample data provided. Do not connect a bank account or enter real financial information. Screenshots, screen recordings and voice notes are optional and need your separate consent.',
    true,
    'Take your time and be honest — we are testing the app, not you. If something is confusing, that is exactly what we need to hear. You can pause and come back whenever you like.',
    'Open the demo link on your phone. The app is pre-loaded with sample (synthetic) transactions in AED. Never enter real bank details.',
    'testing-support@example.com',
    $form${"steps":[
      {"id":"experience","title":"Experience profile","intro":"A couple of quick questions about you. There are no wrong answers.","questions":[
        {"key":"experience_level","label":"How comfortable are you with managing personal finances digitally?","type":"single","required":true,"segment":true,"options":[
          {"value":"beginner","label":"Beginner"},{"value":"somewhat_comfortable","label":"Somewhat comfortable"},
          {"value":"very_comfortable","label":"Very comfortable"},{"value":"experienced","label":"Experienced"}]},
        {"key":"used_budget_apps","label":"Have you previously used budgeting or expense-tracking applications?","type":"single","required":true,"options":[
          {"value":"yes","label":"Yes"},{"value":"no","label":"No"}]}]},
      {"id":"habits","title":"Everyday habits","intro":"How you handle money day to day.","questions":[
        {"key":"tracking_frequency","label":"How frequently do you track expenses?","type":"single","required":true,"options":[
          {"value":"almost_every_expense","label":"I track almost every expense"},{"value":"check_occasionally","label":"I check occasionally"},
          {"value":"only_when_needed","label":"Only when I need to"},{"value":"dont_track","label":"I don’t currently track expenses"}]},
        {"key":"current_method","label":"How do you usually understand where your money goes?","type":"single","required":true,"options":[
          {"value":"banking_app","label":"Banking application"},{"value":"notes_spreadsheets","label":"Notes or spreadsheets"},
          {"value":"mental","label":"Mental calculations"},{"value":"dont_track","label":"I don’t currently track it"}]},
        {"key":"device","label":"Which device will you use?","type":"single","required":true,"segment":true,"options":[
          {"value":"iphone","label":"iPhone"},{"value":"android","label":"Android"}]},
        {"key":"country","label":"Which country do you primarily live in?","type":"country","required":true,"segment":true}]},
      {"id":"motivation","title":"Motivation and expectations","intro":"What you hope to get out of it.","questions":[
        {"key":"motivation","label":"Why would you like to test Pocket Budget?","type":"text","required":true},
        {"key":"desired_help","label":"What would you most like the app to help you with?","type":"multi","required":true,"options":[
          {"value":"easy_expense_tracking","label":"Easy expense tracking"},{"value":"understanding_spending","label":"Understanding spending"},
          {"value":"monthly_budgeting","label":"Monthly budgeting"},{"value":"saving_money","label":"Saving money"},
          {"value":"avoiding_overspending","label":"Avoiding overspending"},{"value":"financial_goals","label":"Setting financial goals"}]},
        {"key":"preferred_experience","label":"What would make you enjoy using a budgeting app?","type":"single","required":true,"options":[
          {"value":"simple_effortless","label":"Simple and effortless"},{"value":"detailed_charts","label":"Detailed charts and insights"},
          {"value":"reminders_alerts","label":"Reminders and alerts"},{"value":"personalised_recommendations","label":"Personalised saving recommendations"}]}]}
    ]}$form$::jsonb, now());

  insert into testing_objectives (round_id, objective, sort_order) values
    (rnd_pocket, 'Check whether a first-time user can find their way around the dashboard without help.', 1),
    (rnd_pocket, 'Confirm that creating a monthly budget and adding expenses is quick and error-free.', 2),
    (rnd_pocket, 'Learn whether the spending insights are understood by people new to budgeting.', 3),
    (rnd_pocket, 'Find out how easily a mistake in a transaction can be found and corrected.', 4);

  -- The five Pocket Budget tasks are plain rows in the reusable task engine.
  insert into testing_tasks (round_id, position, is_required) values (rnd_pocket, 1, true) returning id into t1;
  perform _insert_task_version(t1, $j${"title":"Explore the dashboard","task_type":"feature_exploration","estimated_minutes":4,
    "description":"Get your bearings in the app before doing anything else.",
    "scenario":"You have just opened Pocket Budget for the first time.",
    "instructions":["Open the dashboard.","Find the monthly spending summary.","Identify the remaining budget.","Find spending categories.","Locate the add-expense action."],
    "expected_result":"You can point to the monthly summary, the remaining budget, the spending categories and the add-expense button.",
    "success_criteria":["Monthly spending summary found","Remaining budget identified","Spending categories found","Add-expense action located"],
    "measures":["Time to complete","Whether the tester needed help","Navigation difficulty","Comprehension"],
    "feedback_questions":[{"key":"hardest_to_find","label":"Was anything hard to find? Which part?","type":"text"}]}$j$::jsonb);

  insert into testing_tasks (round_id, position, is_required) values (rnd_pocket, 2, true) returning id into t2;
  perform _insert_task_version(t2, $j${"title":"Create a monthly budget","task_type":"guided_scenario","estimated_minutes":4,
    "scenario":"You want to set a monthly spending limit of AED 4,000.",
    "instructions":["Navigate to budgets.","Create a monthly budget.","Enter AED 4,000.","Save.","Verify the updated dashboard."],
    "expected_result":"A monthly budget of AED 4,000 is saved and the dashboard shows it.",
    "success_criteria":["Budget created","Amount saved correctly","Dashboard updated","Monthly period understood"],
    "measures":["Budget creation success","Clarity of the monthly period"],
    "feedback_questions":[{"key":"period_clear","label":"Was it clear the budget covers one calendar month?","type":"single","options":[
      {"value":"yes","label":"Yes"},{"value":"not_sure","label":"Not sure"},{"value":"no","label":"No"}]}]}$j$::jsonb);

  insert into testing_tasks (round_id, position, is_required) values (rnd_pocket, 3, true) returning id into t3;
  perform _insert_task_version(t3, $j${"title":"Add and categorise expenses","task_type":"guided_scenario","estimated_minutes":5,
    "scenario":"You spent AED 45 on groceries and AED 30 on transport.",
    "instructions":["Add AED 45.","Assign Groceries.","Add AED 30.","Assign Transport.","Verify both transactions."],
    "expected_result":"Two transactions appear — AED 45 in Groceries and AED 30 in Transport — and total spending went up by AED 75.",
    "success_criteria":["Correct values","Correct categories","Correct spending total"],
    "measures":["Entry accuracy","Category assignment","Total correctness"]}$j$::jsonb);

  insert into testing_tasks (round_id, position, is_required) values (rnd_pocket, 4, true) returning id into t4;
  perform _insert_task_version(t4, $j${"title":"Understand spending insights","task_type":"comprehension_check","estimated_minutes":5,
    "scenario":"You want to understand where your money is going.",
    "instructions":["Open insights.","Identify highest spending category.","Review category breakdown.","Find remaining budget.","Explain what the information means."],
    "expected_result":"You can say which category you spend most on and how much budget is left.",
    "success_criteria":["Highest spending category identified","Category breakdown reviewed","Remaining budget found"],
    "measures":["Comprehension","Chart usability","Usefulness","Missing information"],
    "feedback_questions":[
      {"key":"explain","label":"In your own words, what is this screen telling you?","type":"text"},
      {"key":"missing","label":"Is any information missing that you expected to see?","type":"text"}]}$j$::jsonb);

  insert into testing_tasks (round_id, position, is_required, depends_on_task_id) values (rnd_pocket, 5, true, t3) returning id into t5;
  perform _insert_task_version(t5, $j${"title":"Find and fix a mistake","task_type":"usability_assessment","estimated_minutes":4,
    "scenario":"You accidentally recorded AED 300 instead of AED 30 for transport.",
    "instructions":["Find the transaction.","Edit the amount.","Save.","Verify the updated total."],
    "expected_result":"The transport transaction shows AED 30 and the spending total is corrected.",
    "success_criteria":["Transaction discoverable","Amount editable","Correct total","Clear confirmation"],
    "measures":["Discoverability of editing","Confirmation clarity"]}$j$::jsonb);

  -- ---------------------------------------------------------------- demo tester: saved draft application
  -- Exactly the answers supplied for the illustrative profile. Step 4 (availability + consent) was
  -- never answered, so it is left unanswered rather than assumed.
  insert into tester_applications (round_id, tester_id, status, current_step, is_demo, answers)
  values (rnd_pocket, u_tester, 'draft', 4, true, jsonb_build_object(
    'experience_level', 'beginner',
    'used_budget_apps', 'no',
    'tracking_frequency', 'check_occasionally',
    'current_method', 'banking_app',               -- stated as: "I usually check my bank app"
    'device', 'iphone',
    'country', 'AE',
    'motivation', 'I want to understand where my money goes and manage my spending better.',
    'desired_help', jsonb_build_array('easy_expense_tracking', 'understanding_spending', 'monthly_budgeting'),
    'preferred_experience', 'simple_effortless'    -- stated as: "Something simple that doesn’t require much effort"
  ));

  -- ---------------------------------------------------------------- second demo product (different category, form and tasks)
  insert into products (id, creator_id, name, description, category, stage, stage_label, target_audience, demo_url, is_demo)
  values (p_focus, u_creator, 'FocusFlow',
    'A lightweight focus timer that groups your day into work blocks and shows where your attention went. Demonstration listing that shows a second category configured without code changes.',
    'productivity', 'alpha', 'Early prototype', 'Students and remote workers who use a to-do list or timer today.',
    'https://example.com/focusflow-demo', true);
  insert into product_releases (id, product_id, version, notes, access_url, access_instructions)
  values (rel_focus, p_focus, 'v0.3.0', 'Clickable prototype.', 'https://example.com/focusflow-demo', 'Open the prototype link in any browser.');
  insert into testing_rounds (id, product_id, release_id, round_number, title, status, summary, target_audience, cohort_size,
    expected_minutes_min, expected_minutes_max, supported_devices, countries, application_deadline, testing_deadline,
    reward_type, reward_details, privacy_requirements, beginner_friendly, instructions, access_instructions, support_contact,
    application_form, published_at)
  values (rnd_focus, p_focus, rel_focus, 1, 'FocusFlow prototype test', 'published',
    'You will plan a short work session in the prototype, compare it with the tool you use today, and then explore freely for a few minutes.',
    'People who already plan their day with some kind of tool.', 8, 10, 15, array['iphone','android','web'], '{}',
    now() + interval '21 days', now() + interval '35 days', 'perk', 'Three months of the paid plan after launch.',
    'No personal data is needed. Use made-up task names.', false,
    'Think aloud if you can, and tell us wherever the prototype surprised you.', 'Open the prototype link in any browser.',
    'testing-support@example.com',
    $form${"steps":[
      {"id":"tools","title":"Your current tools","questions":[
        {"key":"current_tool","label":"What do you use to plan your work today?","type":"single","required":true,"segment":true,"options":[
          {"value":"todo_app","label":"A to-do app"},{"value":"calendar","label":"My calendar"},{"value":"paper","label":"Pen and paper"},{"value":"nothing","label":"Nothing in particular"}]},
        {"key":"device","label":"Which device will you use?","type":"single","required":true,"segment":true,"options":[
          {"value":"iphone","label":"iPhone"},{"value":"android","label":"Android"},{"value":"web","label":"Laptop / web"}]},
        {"key":"country","label":"Which country do you primarily live in?","type":"country","required":false,"segment":true}]},
      {"id":"why","title":"Why this test","questions":[
        {"key":"motivation","label":"What makes staying focused hard for you?","type":"text","required":true}]}
    ]}$form$::jsonb, now());
  insert into testing_objectives (round_id, objective, sort_order) values
    (rnd_focus, 'See whether planning a work block is faster than in testers'' current tool.', 1),
    (rnd_focus, 'Collect first impressions from unguided exploration.', 2);
  insert into testing_tasks (round_id, position, is_required) values (rnd_focus, 1, true) returning id into f1;
  perform _insert_task_version(f1, $j${"title":"Plan a work session and compare","task_type":"comparison","estimated_minutes":6,
    "scenario":"You have two hours this afternoon and three things to get done.",
    "instructions":["Create three work blocks.","Start the first block.","Think about how you would do the same in the tool you use today."],
    "expected_result":"Three blocks are planned and the first one is running.",
    "success_criteria":["Three blocks created","Timer started"],
    "feedback_questions":[{"key":"comparison","label":"Compared with what you use today, this was…","type":"single","options":[
      {"value":"faster","label":"Faster"},{"value":"same","label":"About the same"},{"value":"slower","label":"Slower"}]}]}$j$::jsonb);
  insert into testing_tasks (round_id, position, is_required) values (rnd_focus, 2, false) returning id into f2;
  perform _insert_task_version(f2, $j${"title":"Explore freely","task_type":"open_exploration","estimated_minutes":5,"allow_skip":true,
    "scenario":"Spend a few minutes looking at anything that catches your eye.",
    "instructions":["Tap around the prototype.","Note anything confusing or delightful."],
    "expected_result":"You have an opinion about at least one thing you would change."}$j$::jsonb);

  -- ---------------------------------------------------------------- platform task templates (one per task type)
  insert into task_templates (owner_id, is_public, title, task_type, definition) values
    (null, true, 'First-run walkthrough', 'guided_scenario', $j${"title":"First-run walkthrough","task_type":"guided_scenario","estimated_minutes":5,"scenario":"You are opening the product for the first time.","instructions":["Open the product.","Complete the first step it asks you to do.","Stop when you reach the main screen."],"expected_result":"You reach the main screen.","success_criteria":["Main screen reached without help"]}$j$::jsonb),
    (null, true, 'Explore a feature', 'feature_exploration', $j${"title":"Explore a feature","task_type":"feature_exploration","estimated_minutes":5,"scenario":"You heard this product has a feature you would like to try.","instructions":["Find the feature.","Try it once."],"expected_result":"You used the feature once.","success_criteria":["Feature found","Feature used"]}$j$::jsonb),
    (null, true, 'Usability check', 'usability_assessment', $j${"title":"Usability check","task_type":"usability_assessment","estimated_minutes":4,"scenario":"You need to change something you entered earlier.","instructions":["Find what you entered.","Change it.","Confirm the change was saved."],"expected_result":"The change is saved and clearly confirmed.","success_criteria":["Item found","Item changed","Confirmation shown"]}$j$::jsonb),
    (null, true, 'Reproduce a reported bug', 'bug_reproduction', $j${"title":"Reproduce a reported bug","task_type":"bug_reproduction","estimated_minutes":5,"scenario":"The team has had a report of a problem and wants to know whether you see it too.","instructions":["Follow the steps the team listed.","Note whether the problem appears."],"expected_result":"You can say whether the problem happens on your device.","required_evidence":["screenshot"],"feedback_questions":[{"key":"reproduced","label":"Did the problem happen for you?","type":"single","options":[{"value":"yes","label":"Yes"},{"value":"no","label":"No"},{"value":"sometimes","label":"Sometimes"}]}]}$j$::jsonb),
    (null, true, 'Compare with what you use today', 'comparison', $j${"title":"Compare with what you use today","task_type":"comparison","estimated_minutes":6,"scenario":"Do one everyday job here, then think about how you do it today.","instructions":["Do the job in this product.","Compare it with your current tool."],"expected_result":"You can say which was easier and why.","feedback_questions":[{"key":"comparison","label":"Compared with what you use today, this was…","type":"single","options":[{"value":"better","label":"Better"},{"value":"same","label":"About the same"},{"value":"worse","label":"Worse"}]}]}$j$::jsonb),
    (null, true, 'Explain it back', 'comprehension_check', $j${"title":"Explain it back","task_type":"comprehension_check","estimated_minutes":4,"scenario":"Look at a screen and tell us what you think it means.","instructions":["Open the screen.","Read it for a moment."],"expected_result":"You can explain the screen in your own words.","feedback_questions":[{"key":"explain","label":"In your own words, what is this screen telling you?","type":"text"}]}$j$::jsonb),
    (null, true, 'Free exploration', 'open_exploration', $j${"title":"Free exploration","task_type":"open_exploration","estimated_minutes":5,"allow_skip":true,"scenario":"Look around at anything you like.","instructions":["Explore freely.","Note anything confusing or delightful."],"expected_result":"You have at least one observation to share."}$j$::jsonb),
    (null, true, 'Final product review', 'final_review', $j${"title":"Final product review","task_type":"final_review","estimated_minutes":3,"scenario":"You have finished trying the product.","instructions":["Think back over everything you tried."],"expected_result":"You can sum up your overall impression.","feedback_questions":[{"key":"one_word","label":"Describe the product in a few words.","type":"text"}]}$j$::jsonb);
end $$;
