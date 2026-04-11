--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', '0719d1c0-f1d8-4d0a-bea9-8edad3854777', 'authenticated', 'authenticated', 'sistemasmya@hotmail.com', '$2a$10$FzSX3.MlrR0CirqPO.fWmeyfRPJPUkilN6P5baJ5YlQJCQW/6yFx2', '2026-03-03 19:28:52.416616+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-04-02 18:35:22.398767+00', '{"provider": "email", "providers": ["email"], "empresa_id": 3}', '{"email_verified": true}', NULL, '2026-03-03 19:28:52.413282+00', '2026-04-02 18:35:22.426476+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', 'fa335f48-8c97-48dd-a3a1-0bd1a5b347cc', 'authenticated', 'authenticated', 'marcomv30@gmail.com', '$2a$10$8cZ/u08Xm.DWMYuXZJBtBe0R7Bn1r59oHm7/pW/7j1mWFUXjr277W', '2026-03-03 19:37:41.583641+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-03-22 19:40:23.497857+00', '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2026-03-03 19:37:41.583641+00', '2026-03-22 19:40:23.502363+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', 'dddcfd28-0239-492f-bf8b-b53ae363f557', 'authenticated', 'authenticated', 'valfabo@hotmail.com', '$2a$06$qzYEOSuTmzQlxJbloPGsC.eIskEiPuo1sW9MEvdk3ifyj8ohL4qQy', '2026-03-04 17:43:23.658615+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-03-21 02:37:06.311759+00', '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2026-03-04 17:43:23.658615+00', '2026-03-21 02:37:06.340813+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: -
--

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('0719d1c0-f1d8-4d0a-bea9-8edad3854777', '0719d1c0-f1d8-4d0a-bea9-8edad3854777', '{"sub": "0719d1c0-f1d8-4d0a-bea9-8edad3854777", "email": "sistemasmya@hotmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-03 19:28:52.414774+00', '2026-03-03 19:28:52.414835+00', '2026-03-03 19:28:52.414835+00', 'b021cdbe-41fc-4986-8d5f-06e9c63e33ba');
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('fa335f48-8c97-48dd-a3a1-0bd1a5b347cc', 'fa335f48-8c97-48dd-a3a1-0bd1a5b347cc', '{"sub": "fa335f48-8c97-48dd-a3a1-0bd1a5b347cc", "email": "marcomv30@gmail.com"}', 'email', '2026-03-03 19:37:41.583641+00', '2026-03-03 19:37:41.583641+00', '2026-03-03 19:37:41.583641+00', '45c2e5c3-6e69-445d-9541-1afe2a25fe1a');
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('dddcfd28-0239-492f-bf8b-b53ae363f557', 'dddcfd28-0239-492f-bf8b-b53ae363f557', '{"sub": "dddcfd28-0239-492f-bf8b-b53ae363f557", "email": "valfabo@hotmail.com"}', 'email', '2026-03-04 17:43:23.658615+00', '2026-03-04 17:43:23.658615+00', '2026-03-04 17:43:23.658615+00', '5536e73e-c621-417e-8f2c-b0714472d7c3');


--
-- PostgreSQL database dump complete
--


