-- ============================================================
-- GSO PRIMS — Stock suggestions for the portal's RIS form
--
-- The portal's Requisition and Issue Slip suggests items from central stock
-- while the requester types. 034 withdrew anonymous reads of inventory_items,
-- and that stays: this function is the only way in, and it returns three
-- things per match:
--
--   name      as GSO keeps it in the register
--   unit      the unit it is issued in
--   in_stock  whether any is on hand
--
-- No price, no exact count, no item code, location or supplier. A query
-- shorter than two characters returns nothing, and at most eight rows come
-- back, so the register is not listed in one call.
--
-- The form works without this function (it shows no suggestions), so the
-- frontend can ship before this file is run.
--
-- Run once in the Supabase SQL Editor, after 049. Safe to re-run.
-- ============================================================

create or replace function public.portal_stock_suggestions(p_query text)
returns table (name text, unit text, in_stock boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.name, i.unit, i.on_hand > 0 as in_stock
  from public.inventory_items i
  where length(btrim(coalesce(p_query, ''))) >= 2
    -- Typed % and _ match themselves, not any text.
    and i.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by
    -- Names that start with what was typed come first.
    (i.name ilike replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%') desc,
    i.name
  limit 8;
$$;

revoke execute on function public.portal_stock_suggestions(text) from public;
grant execute on function public.portal_stock_suggestions(text) to anon, authenticated;
