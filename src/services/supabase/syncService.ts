import { communityCloudService } from './communityCloudService';
import { playerCloudService } from './playerCloudService';
import { communityPlayerCloudService, CommunityPlayerDb } from './communityPlayerCloudService';
import { communityRulesCloudService } from './communityRulesCloudService';
import { whatsappTemplateCloudService } from './whatsappTemplateCloudService';
import { Community, Player, CommunityRules, WhatsAppListTemplate } from '../../types';

export interface LocalSyncPayload {
  communities: Community[];
  players: Player[];
  rules: CommunityRules[];
  templates: WhatsAppListTemplate[];
}

export const syncService = {
  /**
   * Pushes all local data to the cloud, creating or updating records.
   * Assumes local-first data is the source of truth for this operation.
   */
  async uploadLocalDataToCloud(
    local: LocalSyncPayload,
    ownerId: string
  ): Promise<LocalSyncPayload> {
    const nowStr = new Date().toISOString();

    // 1. Upload Communities
    const updatedCommunities: Community[] = [];
    const communityLocalToCloudIdMap: Record<string, string> = {};

    for (const comm of local.communities) {
      if (comm.deletedAt) {
        if (comm.cloudId) {
          await communityCloudService.softDelete(comm.cloudId);
        }
        updatedCommunities.push({
          ...comm,
          syncStatus: 'synced',
          lastSyncedAt: nowStr,
        });
        continue;
      }

      const uploaded = await communityCloudService.upsert(comm, ownerId);
      communityLocalToCloudIdMap[comm.id] = uploaded.cloudId!;
      updatedCommunities.push({
        ...comm,
        cloudId: uploaded.cloudId,
        syncStatus: 'synced',
        lastSyncedAt: nowStr,
      });
    }

    // 2. Upload Players
    const updatedPlayers: Player[] = [];
    const playerLocalToCloudIdMap: Record<string, string> = {};

    for (const player of local.players) {
      if (player.deletedAt) {
        if (player.cloudId) {
          await playerCloudService.softDelete(player.cloudId);
        }
        updatedPlayers.push({
          ...player,
          syncStatus: 'synced',
          lastSyncedAt: nowStr,
        });
        continue;
      }

      const uploaded = await playerCloudService.upsert(player, ownerId);
      playerLocalToCloudIdMap[player.id] = uploaded.cloudId!;
      updatedPlayers.push({
        ...player,
        cloudId: uploaded.cloudId,
        syncStatus: 'synced',
        lastSyncedAt: nowStr,
      });
    }

    // 3. Upload Community Rules
    const updatedRules: CommunityRules[] = [];
    for (const rule of local.rules) {
      const commCloudId = communityLocalToCloudIdMap[rule.communityId] || rule.cloudId;
      if (!commCloudId) {
        // Can't sync rules for a community that doesn't exist in cloud
        updatedRules.push(rule);
        continue;
      }

      const uploaded = await communityRulesCloudService.upsert(rule, ownerId, commCloudId);
      updatedRules.push({
        ...rule,
        cloudId: uploaded.cloudId,
        syncStatus: 'synced',
        lastSyncedAt: nowStr,
      });
    }

    // 4. Upload WhatsApp List Templates
    const updatedTemplates: WhatsAppListTemplate[] = [];
    for (const t of local.templates) {
      const commCloudId = communityLocalToCloudIdMap[t.communityId] || t.cloudId;
      if (t.deletedAt) {
        if (t.cloudId) {
          await whatsappTemplateCloudService.softDelete(t.cloudId);
        }
        updatedTemplates.push({
          ...t,
          syncStatus: 'synced',
          lastSyncedAt: nowStr,
        });
        continue;
      }

      if (!commCloudId) {
        updatedTemplates.push(t);
        continue;
      }

      const uploaded = await whatsappTemplateCloudService.upsert(t, ownerId, commCloudId);
      updatedTemplates.push({
        ...t,
        cloudId: uploaded.cloudId,
        syncStatus: 'synced',
        lastSyncedAt: nowStr,
      });
    }

    // 5. Upload Community-Player Relations
    const relationsToUpload: Omit<CommunityPlayerDb, 'id'>[] = [];
    for (const player of local.players) {
      if (player.deletedAt) continue;
      const playerCloudId = playerLocalToCloudIdMap[player.id] || player.cloudId;
      if (!playerCloudId) continue;

      const commIds = player.communityIds || [];
      for (const localCommId of commIds) {
        const commCloudId = communityLocalToCloudIdMap[localCommId] || local.communities.find(c => c.id === localCommId)?.cloudId;
        if (!commCloudId) continue;

        relationsToUpload.push({
          owner_id: ownerId,
          community_id: commCloudId,
          player_id: playerCloudId,
          active: true,
        });
      }
    }

    // Clear old relations and insert new ones
    if (relationsToUpload.length > 0) {
      await communityPlayerCloudService.clearAllForUser();
      await communityPlayerCloudService.bulkUpsert(relationsToUpload);
    }

    return {
      communities: updatedCommunities.filter(c => !c.deletedAt),
      players: updatedPlayers.filter(p => !p.deletedAt),
      rules: updatedRules,
      templates: updatedTemplates.filter(t => !t.deletedAt),
    };
  },

  /**
   * Downloads all data from the cloud and maps it to local entities,
   * completely replacing the current local database state.
   */
  async downloadCloudDataToLocal(): Promise<LocalSyncPayload> {
    // 1. Fetch communities and players
    const cloudCommunities = await communityCloudService.fetchAll();
    const cloudPlayers = await playerCloudService.fetchAll();

    // Build ID lookup maps: cloudId -> localId
    const communityCloudToLocalIdMap: Record<string, string> = {};
    cloudCommunities.forEach(c => {
      communityCloudToLocalIdMap[c.cloudId!] = c.id;
    });

    const playerCloudToLocalIdMap: Record<string, string> = {};
    cloudPlayers.forEach(p => {
      playerCloudToLocalIdMap[p.cloudId!] = p.id;
    });

    // 2. Fetch Rules and Templates
    const cloudRules = await communityRulesCloudService.fetchAll(communityCloudToLocalIdMap);
    const cloudTemplates = await whatsappTemplateCloudService.fetchAll(communityCloudToLocalIdMap);

    // 3. Fetch Relations and map them to players
    const cloudRelations = await communityPlayerCloudService.fetchAll();
    
    // Group communityIds by local player ID
    const playerMemberships: Record<string, string[]> = {};
    for (const rel of cloudRelations) {
      const localPlayerId = playerCloudToLocalIdMap[rel.player_id];
      const localCommId = communityCloudToLocalIdMap[rel.community_id];
      if (localPlayerId && localCommId && rel.active) {
        if (!playerMemberships[localPlayerId]) {
          playerMemberships[localPlayerId] = [];
        }
        playerMemberships[localPlayerId].push(localCommId);
      }
    }

    // Assign mapped communityIds to the players
    const mappedPlayers = cloudPlayers.map(p => ({
      ...p,
      communityIds: playerMemberships[p.id] || [],
    }));

    return {
      communities: cloudCommunities,
      players: mappedPlayers,
      rules: cloudRules,
      templates: cloudTemplates,
    };
  },

  /**
   * Performs a bi-directional synchronization between local and cloud databases.
   * Compares each entity using last-write-wins based on updatedAt.
   */
  async syncNow(local: LocalSyncPayload, ownerId: string): Promise<LocalSyncPayload> {
    const cloud = await this.downloadCloudDataToLocal();

    const mergedCommunities: Community[] = [];
    const mergedPlayers: Player[] = [];
    const mergedRules: CommunityRules[] = [];
    const mergedTemplates: WhatsAppListTemplate[] = [];

    // --- Sync Communities ---
    // Track processed cloud IDs
    const processedCloudCommIds = new Set<string>();

    for (const localComm of local.communities) {
      const cloudComm = cloud.communities.find(
        c => c.cloudId === localComm.cloudId || c.id === localComm.id
      );

      if (cloudComm) {
        processedCloudCommIds.add(cloudComm.cloudId!);

        if (localComm.deletedAt || cloudComm.deletedAt) {
          // If either deleted, mark soft-delete
          mergedCommunities.push({
            ...localComm,
            deletedAt: localComm.deletedAt || cloudComm.deletedAt,
            syncStatus: 'pending',
          });
        } else {
          const localTime = new Date(localComm.updatedAt).getTime();
          const cloudTime = new Date(cloudComm.updatedAt).getTime();

          if (localTime >= cloudTime) {
            mergedCommunities.push({
              ...localComm,
              cloudId: cloudComm.cloudId,
              syncStatus: 'pending',
            });
          } else {
            mergedCommunities.push({
              ...cloudComm,
              id: localComm.id, // Keep local ID
              syncStatus: 'synced',
            });
          }
        }
      } else {
        // Exists locally but not on cloud (new or deleted on cloud)
        if (localComm.cloudId) {
          // It had a cloudId previously, so it was deleted from cloud by another client
          // We apply the delete locally
          mergedCommunities.push({
            ...localComm,
            deletedAt: new Date().toISOString(),
            syncStatus: 'synced',
          });
        } else {
          // Truly new local community
          mergedCommunities.push({
            ...localComm,
            syncStatus: 'pending',
          });
        }
      }
    }

    // Add communities that exist in cloud but not locally
    for (const cloudComm of cloud.communities) {
      if (!processedCloudCommIds.has(cloudComm.cloudId!)) {
        mergedCommunities.push(cloudComm);
      }
    }

    // --- Sync Players ---
    const processedCloudPlayerIds = new Set<string>();

    for (const localPlayer of local.players) {
      const cloudPlayer = cloud.players.find(
        p => p.cloudId === localPlayer.cloudId || p.id === localPlayer.id
      );

      if (cloudPlayer) {
        processedCloudPlayerIds.add(cloudPlayer.cloudId!);

        if (localPlayer.deletedAt || cloudPlayer.deletedAt) {
          mergedPlayers.push({
            ...localPlayer,
            deletedAt: localPlayer.deletedAt || cloudPlayer.deletedAt,
            syncStatus: 'pending',
          });
        } else {
          const localTime = new Date(localPlayer.updatedAt || localPlayer.metadata.atualizadoEm).getTime();
          const cloudTime = new Date(cloudPlayer.updatedAt || cloudPlayer.metadata.atualizadoEm).getTime();

          if (localTime >= cloudTime) {
            mergedPlayers.push({
              ...localPlayer,
              cloudId: cloudPlayer.cloudId,
              syncStatus: 'pending',
            });
          } else {
            // Keep community IDs from local player if we want to merge, or use cloud
            // Let's use cloud communityIds but map them back to local ids if needed.
            // Since cloud.players already resolved them, we use cloudPlayer.
            mergedPlayers.push({
              ...cloudPlayer,
              id: localPlayer.id, // Keep local ID
              syncStatus: 'synced',
            });
          }
        }
      } else {
        if (localPlayer.cloudId) {
          // Deleted from cloud
          mergedPlayers.push({
            ...localPlayer,
            deletedAt: new Date().toISOString(),
            syncStatus: 'synced',
          });
        } else {
          mergedPlayers.push({
            ...localPlayer,
            syncStatus: 'pending',
          });
        }
      }
    }

    for (const cloudPlayer of cloud.players) {
      if (!processedCloudPlayerIds.has(cloudPlayer.cloudId!)) {
        mergedPlayers.push(cloudPlayer);
      }
    }

    // --- Sync Community Rules ---
    for (const localRule of local.rules) {
      const cloudRule = cloud.rules.find(
        r => r.communityId === localRule.communityId || r.cloudId === localRule.cloudId
      );

      if (cloudRule) {
        const localTime = new Date(localRule.updatedAt).getTime();
        const cloudTime = new Date(cloudRule.updatedAt).getTime();

        if (localTime >= cloudTime) {
          mergedRules.push({
            ...localRule,
            cloudId: cloudRule.cloudId,
            syncStatus: 'pending',
          });
        } else {
          mergedRules.push({
            ...cloudRule,
            communityId: localRule.communityId, // Keep local community ID mapping
            syncStatus: 'synced',
          });
        }
      } else {
        mergedRules.push({
          ...localRule,
          syncStatus: 'pending',
        });
      }
    }

    // Add rules from cloud that aren't local yet
    for (const cloudRule of cloud.rules) {
      if (!mergedRules.some(r => r.cloudId === cloudRule.cloudId)) {
        mergedRules.push(cloudRule);
      }
    }

    // --- Sync Templates ---
    const processedCloudTemplateIds = new Set<string>();

    for (const localTemplate of local.templates) {
      const cloudTemplate = cloud.templates.find(
        t => t.cloudId === localTemplate.cloudId || t.id === localTemplate.id
      );

      if (cloudTemplate) {
        processedCloudTemplateIds.add(cloudTemplate.cloudId!);

        if (localTemplate.deletedAt || cloudTemplate.deletedAt) {
          mergedTemplates.push({
            ...localTemplate,
            deletedAt: localTemplate.deletedAt || cloudTemplate.deletedAt,
            syncStatus: 'pending',
          });
        } else {
          const localTime = new Date(localTemplate.updatedAt).getTime();
          const cloudTime = new Date(cloudTemplate.updatedAt).getTime();

          if (localTime >= cloudTime) {
            mergedTemplates.push({
              ...localTemplate,
              cloudId: cloudTemplate.cloudId,
              syncStatus: 'pending',
            });
          } else {
            mergedTemplates.push({
              ...cloudTemplate,
              id: localTemplate.id,
              communityId: localTemplate.communityId,
              syncStatus: 'synced',
            });
          }
        }
      } else {
        if (localTemplate.cloudId) {
          mergedTemplates.push({
            ...localTemplate,
            deletedAt: new Date().toISOString(),
            syncStatus: 'synced',
          });
        } else {
          mergedTemplates.push({
            ...localTemplate,
            syncStatus: 'pending',
          });
        }
      }
    }

    for (const cloudTemplate of cloud.templates) {
      if (!processedCloudTemplateIds.has(cloudTemplate.cloudId!)) {
        mergedTemplates.push(cloudTemplate);
      }
    }

    // Finally, run upload on the merged local state to update the cloud with any new/newer local data
    const finalPayload = {
      communities: mergedCommunities,
      players: mergedPlayers,
      rules: mergedRules,
      templates: mergedTemplates,
    };

    return await this.uploadLocalDataToCloud(finalPayload, ownerId);
  }
};
