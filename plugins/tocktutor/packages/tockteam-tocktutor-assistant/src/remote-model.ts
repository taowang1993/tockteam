/**
 * Typert reflection source only. Runtime behavior lives in remote.ts so Node can
 * execute source-based tests without parsing decorator syntax.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteScope, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AssistantApprovalRequest,
  AssistantApprovalView,
  AssistantAuditResult,
  AssistantDecisionView,
  AssistantPageRequest,
  AssistantProposalListResult,
  AssistantRejectionRequest,
  AssistantSettingsView,
  AssistantTurnRequest,
  AssistantTurnResult,
} from './remote-types.ts'

export class TockTutorAssistantRemoteModel extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'tocktutorAssistant')
  }

  @Remote
  async currentSettings(signal: AbortSignal): Promise<AssistantSettingsView> {
    throw new Error('Typert reflection model is not executable.')
  }

  @Remote
  async saveSettings(
    request: AssistantSettingsView,
    signal: AbortSignal,
  ): Promise<AssistantSettingsView> {
    throw new Error('Typert reflection model is not executable.')
  }

  @RemoteScope('agent')
  async continueTurn(
    request: AssistantTurnRequest,
    signal: AbortSignal,
  ): Promise<AssistantTurnResult> {
    throw new Error('Typert reflection model is not executable.')
  }

  @Remote
  async listProposals(
    request: AssistantPageRequest,
    signal: AbortSignal,
  ): Promise<AssistantProposalListResult> {
    throw new Error('Typert reflection model is not executable.')
  }

  @Remote
  async approveProposal(
    request: AssistantApprovalRequest,
    signal: AbortSignal,
  ): Promise<AssistantApprovalView> {
    throw new Error('Typert reflection model is not executable.')
  }

  @Remote
  async rejectProposal(
    request: AssistantRejectionRequest,
    signal: AbortSignal,
  ): Promise<AssistantDecisionView> {
    throw new Error('Typert reflection model is not executable.')
  }

  @Remote
  async audit(request: AssistantPageRequest, signal: AbortSignal): Promise<AssistantAuditResult> {
    throw new Error('Typert reflection model is not executable.')
  }
}
