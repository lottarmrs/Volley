import { supabase } from '../../lib/supabaseClient';
import { WhatsAppListTemplate } from '../../types';

export function mapTemplateToDb(
  local: WhatsAppListTemplate,
  ownerId: string,
  communityCloudId: string,
) {
  return {
    id: local.cloudId || undefined,
    owner_id: ownerId,
    community_id: communityCloudId,
    name: local.name,
    title: local.title,
    category: local.category || null,
    default_location: local.defaultLocation || null,
    default_start_time: local.defaultStartTime || null,
    default_end_time: local.defaultEndTime || null,
    default_value: local.defaultValue ?? null,
    pix_key: local.pixKey || null,
    pix_holder: local.pixHolder || null,
    pix_bank: local.pixBank || null,
    payment_deadline: local.paymentDeadline || null,
    payment_note: local.paymentNote || null,
    setters_count: local.settersCount,
    main_slots_count: local.mainSlotsCount,
    reserve_slots_count: local.reserveSlotsCount,
    setters_section_title: local.settersSectionTitle,
    reserve_section_title: local.reserveSectionTitle,
    show_lock_icon: !!local.showLockIcon,
    payment_symbol: local.paymentSymbol,
    extra_text: local.extraText || null,
    local_id: local.id,
    deleted_at: local.deletedAt || null,
    updated_at: local.updatedAt || new Date().toISOString(),
  };
}

export function mapDbToTemplate(db: any, communityLocalId: string): WhatsAppListTemplate {
  return {
    id: db.local_id || db.id,
    communityId: communityLocalId,
    name: db.name,
    title: db.title,
    category: db.category || undefined,
    defaultLocation: db.default_location || undefined,
    defaultStartTime: db.default_start_time || undefined,
    defaultEndTime: db.default_end_time || undefined,
    defaultValue:
      db.default_value !== null && db.default_value !== undefined
        ? Number(db.default_value)
        : undefined,
    pixKey: db.pix_key || undefined,
    pixHolder: db.pix_holder || undefined,
    pixBank: db.pix_bank || undefined,
    paymentDeadline: db.payment_deadline || undefined,
    paymentNote: db.payment_note || undefined,
    settersCount: db.setters_count,
    mainSlotsCount: db.main_slots_count,
    reserveSlotsCount: db.reserve_slots_count,
    settersSectionTitle: db.setters_section_title,
    reserveSectionTitle: db.reserve_section_title,
    showLockIcon: db.show_lock_icon,
    paymentSymbol: db.payment_symbol,
    extraText: db.extra_text || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    cloudId: db.id,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    deletedAt: db.deleted_at || undefined,
  };
}

export const whatsappTemplateCloudService = {
  async fetchAll(communityLocalIdMap: Record<string, string>): Promise<WhatsAppListTemplate[]> {
    const { data, error } = await supabase
      .from('whatsapp_list_templates')
      .select('*')
      .is('deleted_at', null);

    if (error) throw error;

    return (data || [])
      .filter((db) => communityLocalIdMap[db.community_id])
      .map((db) => mapDbToTemplate(db, communityLocalIdMap[db.community_id]));
  },

  async upsert(
    local: WhatsAppListTemplate,
    ownerId: string,
    communityCloudId: string,
  ): Promise<WhatsAppListTemplate> {
    const dbRecord = mapTemplateToDb(local, ownerId, communityCloudId);
    try {
      const { data, error } = await supabase
        .from('whatsapp_list_templates')
        .upsert(dbRecord, { onConflict: 'owner_id,local_id' })
        .select()
        .single();

      if (error) throw error;
      return mapDbToTemplate(data, local.communityId);
    } catch (error: any) {
      if (
        error &&
        (error.code === '23505' || error.statusCode === '23505') &&
        error.message?.includes('whatsapp_list_templates_pkey')
      ) {
        console.warn(`Primary key collision for template ${local.name}. Retrying without id.`);
        const fallbackRecord = { ...dbRecord };
        delete (fallbackRecord as any).id;

        const { data: fallbackData, error: fallbackError } = await supabase
          .from('whatsapp_list_templates')
          .upsert(fallbackRecord, { onConflict: 'owner_id,local_id' })
          .select()
          .single();

        if (fallbackError) throw fallbackError;
        return mapDbToTemplate(fallbackData, local.communityId);
      }
      throw error;
    }
  },

  async softDelete(cloudId: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_list_templates')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cloudId);

    if (error) throw error;
  },
};
