import { supabase } from '../../lib/supabaseClient';

export async function callResetProductData(targetAccountUuid: string): Promise<void> {
  const { error } = await supabase.rpc('reset_product_data', {
    target_account_uuid: targetAccountUuid,
  });
  if (error) throw error;
}