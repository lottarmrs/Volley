-- Account deletion must anonymise a Session organizer assignment, not fail on it.
--
-- GINV-ID-005 / ADR-SEC-011, as implemented by 20260827200000_auth_cascade_safety.sql: deleting
-- an account is a privacy action, not a way to erase shared sports history. An actor reference
-- becomes NULL and the fact survives.
--
-- THE DEFECT. public.session_organizer_assignments references the dying account twice over --
-- directly through organizer_user_id / assigned_by_user_id / revoked_by_user_id, and indirectly
-- through community_membership_id, because community_memberships.user_id cascades from profiles,
-- which cascades from auth.users. One `delete from auth.users` therefore queues SET NULL actions
-- from two different parent tables against the SAME assignment row inside one statement.
--
-- PostgreSQL runs those actions from the row image each one captured. The membership action nulls
-- community_membership_id; the account action then writes its own update from a pre-image that
-- still carries the old membership id, resurrecting a reference whose parent is already gone. The
-- referencing check for that constraint sees the key change and raises:
--
--   23503  insert or update on table "session_organizer_assignments"
--          violates foreign key constraint "session_organizer_assignments_community_membership_id_fkey"
--
-- The final row state is correct -- every actor column and the membership column all reach NULL.
-- Only the per-statement check is wrong, so deferring it to commit is the whole fix. Dropping the
-- constraint instead was measured and rejected: the delete then succeeds but leaves the dead
-- membership id in place, which loses integrity and keeps the resurrected reference.
--
-- SCOPE. This migration fixes the assignment table, which is the one an organizer touches. The
-- same hazard exists wherever a row holds two or more SET NULL parents that die together, and the
-- accompanying suite pins the measured list -- community_members, modification_logs, players,
-- session_organizer_assignments, sessions and teams -- so the slice that finally builds account
-- deletion inherits a list rather than a rumour. Two of those are PROVEN to collide: this one, and
-- modification_logs, which surfaced while building the test for this one. The rest carry the shape
-- and were not exercised. Account deletion is still blocked upstream by the canonical Player
-- guard, so this defect is latent today; it becomes real the day the Unlink command of
-- N2.16 / XS-W2-01 makes deletion possible -- and that slice will have to deal with
-- modification_logs, which this branch does not touch.
--
-- INITIALLY DEFERRED rather than DEFERRABLE INITIALLY IMMEDIATE: a plain `delete from auth.users`
-- has to work without the caller knowing to ask for deferral. The cost is that a write naming a
-- membership that does not exist now fails at COMMIT instead of at the statement.

alter table public.session_organizer_assignments
  drop constraint session_organizer_assignments_community_membership_id_fkey;

alter table public.session_organizer_assignments
  add constraint session_organizer_assignments_community_membership_id_fkey
    foreign key (community_membership_id)
    references public.community_memberships(id)
    on delete set null
    deferrable initially deferred;
