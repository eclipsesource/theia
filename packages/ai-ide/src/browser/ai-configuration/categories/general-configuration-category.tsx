// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
    PREFERENCE_NAME_MAX_RETRIES,
    PREFERENCE_NAME_PROMPT_TEMPLATES
} from '@theia/ai-core/lib/common/ai-core-preferences';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common/language-model';
import {
    BYPASS_MODEL_REQUIREMENT_PREF,
    PERSISTED_SESSION_LIMIT_PREF,
    PIN_CHAT_AGENT_PREF,
    SESSION_STORAGE_PREF,
    WELCOME_SCREEN_SESSIONS_PREF
} from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { PREFERENCE_NAME_AGENT_MODE_ENABLED, PREFERENCE_NAME_ENABLE_AI, PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST } from '../../../common/ai-ide-preferences';
import {
    AiChipEditor,
    AiEnumSelect,
    AiMarkdownDescription,
    AiNumberStepper,
    AiPathInput,
    AiSessionLimitControl,
    AiToggleSwitch
} from '../components/ai-general-settings-controls';

/** Documentation on Theia's AI capabilities, linked from the hero's cost/data disclosure. */
const AI_DOCUMENTATION_URL = 'https://theia-ide.org/docs/user_ai/';

/** A single setting on the page, paired with its section for the deep-search index. */
interface GeneralSettingRef {
    readonly section: string;
    readonly preferenceId: string;
}

/**
 * The General category: a `single-page` category that presents the top-level `ai-features.*`
 * preferences as a curated "AI Features" page. A hero card hosts the master enablement toggle
 * and LLM-provider status; the dependent settings are grouped into Agents, Prompts & requests,
 * Chat and Notifications sections and are visually gated while the master toggle is off.
 *
 * All values are read and written through {@link AiSettingsRowService} (backed by the
 * {@link PreferenceService}), so the page stays live-synced with `settings.json` and the
 * classic preferences editor. Gating is purely visual/interactive; preference values are
 * never rewritten when the master toggle changes.
 */
@injectable()
export class GeneralConfigurationCategory implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.GENERAL;
    readonly label = nls.localize('theia/ai/ide/generalConfiguration/label', 'General');
    readonly iconClass = codicon('settings-gear');
    readonly order = AiConfigurationCategoryOrder.GENERAL;
    readonly kind = 'single-page' as const;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(FileDialogService)
    protected readonly fileDialogService: FileDialogService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    /** Whether at least one language-model provider is ready; drives the hero status line. */
    protected hasReadyProvider = false;

    /** Bound markdown renderer passed to description components (stable identity for `useEffect`). */
    protected readonly renderMarkdown = (markdown: string): HTMLElement => this.settingsRowService.renderMarkdown(markdown);

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        // Refresh the page (values, modified indicators, gating) whenever any preference changes.
        this.toDispose.push(this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire()));
        // Re-evaluate the provider status line when the set of language models changes.
        this.toDispose.push(this.languageModelRegistry.onChange(() => this.refreshProviderStatus()));
        this.refreshProviderStatus();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async refreshProviderStatus(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        const hasReady = models.some(model => model.status.status === 'ready');
        if (hasReady !== this.hasReadyProvider) {
            this.hasReadyProvider = hasReady;
            this.onDidChangeEmitter.fire();
        }
    }

    /** The page's sections and their settings, shared by rendering and the search index. */
    protected getSectionRefs(): GeneralSettingRef[] {
        return [
            { section: this.sectionAgents, preferenceId: PREFERENCE_NAME_AGENT_MODE_ENABLED },
            { section: this.sectionAgents, preferenceId: PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST },
            { section: this.sectionPrompts, preferenceId: PREFERENCE_NAME_PROMPT_TEMPLATES },
            { section: this.sectionPrompts, preferenceId: PREFERENCE_NAME_MAX_RETRIES },
            { section: this.sectionChat, preferenceId: PIN_CHAT_AGENT_PREF },
            { section: this.sectionChat, preferenceId: BYPASS_MODEL_REQUIREMENT_PREF },
            { section: this.sectionChat, preferenceId: PERSISTED_SESSION_LIMIT_PREF },
            { section: this.sectionChat, preferenceId: WELCOME_SCREEN_SESSIONS_PREF },
            { section: this.sectionChat, preferenceId: SESSION_STORAGE_PREF },
            { section: this.sectionNotifications, preferenceId: PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE }
        ];
    }

    protected get sectionAgents(): string {
        return nls.localizeByDefault('Agents');
    }
    protected get sectionPrompts(): string {
        return nls.localize('theia/ai/ide/generalConfiguration/promptsSection', 'Prompts & requests');
    }
    protected get sectionChat(): string {
        return nls.localizeByDefault('Chat');
    }
    protected get sectionNotifications(): string {
        return nls.localizeByDefault('Notifications');
    }

    /** Per-setting, human-readable titles. The preferences share a schema `title`, so titles are authored here. */
    protected titleFor(preferenceId: string): string {
        switch (preferenceId) {
            case PREFERENCE_NAME_ENABLE_AI:
                return nls.localizeByDefault('Enable AI features');
            case PREFERENCE_NAME_AGENT_MODE_ENABLED:
                return nls.localize('theia/ai/ide/generalConfiguration/agentModeTitle', 'Agent mode for Coder');
            case PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST:
                return nls.localize('theia/ai/ide/generalConfiguration/orchestratorExcludeTitle', 'Agents hidden from the orchestrator');
            case PREFERENCE_NAME_PROMPT_TEMPLATES:
                return nls.localize('theia/ai/ide/generalConfiguration/promptTemplatesTitle', 'Prompt templates folder');
            case PREFERENCE_NAME_MAX_RETRIES:
                return nls.localize('theia/ai/ide/generalConfiguration/maxRetriesTitle', 'Maximum retries');
            case PIN_CHAT_AGENT_PREF:
                return nls.localize('theia/ai/ide/generalConfiguration/pinAgentTitle', 'Pin mentioned agents');
            case BYPASS_MODEL_REQUIREMENT_PREF:
                return nls.localize('theia/ai/ide/generalConfiguration/bypassModelTitle', 'Skip language model check');
            case PERSISTED_SESSION_LIMIT_PREF:
                return nls.localize('theia/ai/ide/generalConfiguration/persistedSessionsTitle', 'Persisted chat sessions');
            case WELCOME_SCREEN_SESSIONS_PREF:
                return nls.localize('theia/ai/ide/generalConfiguration/homeSessionsTitle', 'Sessions on the home view');
            case SESSION_STORAGE_PREF:
                return nls.localize('theia/ai/ide/generalConfiguration/sessionStorageTitle', 'Session storage location');
            case PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE:
                return nls.localize('theia/ai/ide/generalConfiguration/notificationTypeTitle', 'Default notification type');
            default:
                return this.settingsRowService.describe(preferenceId).label ?? preferenceId;
        }
    }

    renderPage(ctx: AiConfigurationRenderContext): React.ReactNode {
        const enabled = this.isEnabled(ctx);
        return <div className='ai-general-page'>
            {this.renderHeader()}
            {this.renderHero(ctx, enabled)}
            {!enabled && this.renderGateNote()}
            <div className={`ai-general-sections${enabled ? '' : ' ai-general-off'}`}>
                {this.renderAgentsSection(ctx, !enabled)}
                {this.renderPromptsSection(ctx, !enabled)}
                {this.renderChatSection(ctx, !enabled)}
                {this.renderNotificationsSection(ctx, !enabled)}
            </div>
        </div>;
    }

    protected isEnabled(ctx: AiConfigurationRenderContext): boolean {
        return this.settingsRowService.inspect(PREFERENCE_NAME_ENABLE_AI, ctx.scope).value === true;
    }

    protected renderHeader(): React.ReactNode {
        const title = nls.localize('theia/ai/ide/generalConfiguration/pageTitle', 'AI Features');
        return <div className='ai-general-head'>
            <div className='ai-general-crumbs'>
                <span>{nls.localizeByDefault('Preferences')}</span>
                <span className={`ai-general-crumbs-sep ${codicon('chevron-right')}`}></span>
                <b>{title}</b>
            </div>
            <h1 className='ai-general-head-title'>{title}</h1>
            <p className='ai-general-head-subtitle'>
                {nls.localize('theia/ai/ide/generalConfiguration/pageSubtitle', "Configure Theia's built-in AI capabilities, agents, and chat behavior.")}
            </p>
        </div>;
    }

    protected renderHero(ctx: AiConfigurationRenderContext, enabled: boolean): React.ReactNode {
        return <div className='ai-general-hero'>
            <div className='ai-general-setting-top'>
                <div className='ai-general-setting-main'>
                    <div className='ai-general-setting-title'>
                        {this.titleFor(PREFERENCE_NAME_ENABLE_AI)}
                        <span className='ai-general-setting-id'>{PREFERENCE_NAME_ENABLE_AI}</span>
                    </div>
                    <div className='ai-general-setting-description'>
                        {nls.localize('theia/ai/ide/generalConfiguration/enableAiDescription',
                            'Turns on all AI capabilities of the Theia IDE. Requires at least one configured language model provider.')}
                    </div>
                </div>
                <div className='ai-general-setting-ctrl'>
                    <AiToggleSwitch
                        large
                        checked={enabled}
                        ariaLabel={this.titleFor(PREFERENCE_NAME_ENABLE_AI)}
                        onChange={value => this.commit(PREFERENCE_NAME_ENABLE_AI, value, ctx)}
                    />
                </div>
            </div>
            {this.renderProviderStatus(ctx)}
            <details className='ai-general-risks'>
                <summary>{nls.localize('theia/ai/ide/generalConfiguration/aboutCosts', 'About costs and data usage')}</summary>
                <div className='ai-general-risk-body'>
                    <AiMarkdownDescription
                        renderMarkdown={this.renderMarkdown}
                        markdown={nls.localize('theia/ai/ide/generalConfiguration/costsBody',
                            'AI features send requests to the language model providers you configure. Depending on your provider and usage, this can incur \
costs — monitor them closely. Requests may run continuously while agents are active. See [the documentation]({0}) for details.',
                            AI_DOCUMENTATION_URL)}
                    />
                </div>
            </details>
        </div>;
    }

    protected renderProviderStatus(ctx: AiConfigurationRenderContext): React.ReactNode {
        if (this.hasReadyProvider) {
            return <div className='ai-general-status-line'>
                <span className='ai-configuration-status ai-configuration-status-on'></span>
                <span>{nls.localize('theia/ai/ide/generalConfiguration/providerReady', 'A language model provider is configured and ready.')}</span>
            </div>;
        }
        return <div className='ai-general-status-line'>
            <span className='ai-configuration-status ai-configuration-status-warn'></span>
            <span>
                {nls.localize('theia/ai/ide/generalConfiguration/noProvider', 'No language model provider is configured yet.')}{' '}
                <a
                    href='#'
                    onClick={e => { e.preventDefault(); ctx.navigate({ categoryId: AiConfigurationCategoryId.MODELS }); }}
                >{nls.localize('theia/ai/ide/generalConfiguration/configureProvider', 'Configure a provider')}</a>
            </span>
        </div>;
    }

    protected renderGateNote(): React.ReactNode {
        return <div className='ai-general-gate-note'>
            <span className={codicon('info')}></span>
            <span>{nls.localize('theia/ai/ide/generalConfiguration/gateNote', 'The settings below take effect once Enable AI features is turned on.')}</span>
        </div>;
    }

    protected renderAgentsSection(ctx: AiConfigurationRenderContext, disabled: boolean): React.ReactNode {
        const orchestratorValue = this.arrayValue(PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, ctx);
        return this.renderSection(this.sectionAgents, [
            this.renderSettingRow(ctx, PREFERENCE_NAME_AGENT_MODE_ENABLED, disabled, {
                control: <AiToggleSwitch
                    checked={this.booleanValue(PREFERENCE_NAME_AGENT_MODE_ENABLED, ctx)}
                    ariaLabel={this.titleFor(PREFERENCE_NAME_AGENT_MODE_ENABLED)}
                    disabled={disabled}
                    onChange={value => this.commit(PREFERENCE_NAME_AGENT_MODE_ENABLED, value, ctx)}
                />
            }),
            this.renderSettingRow(ctx, PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, disabled, {
                below: <AiChipEditor
                    values={orchestratorValue}
                    addPlaceholder={nls.localize('theia/ai/ide/generalConfiguration/addAgentId', 'Add agent ID…')}
                    disabled={disabled}
                    onChange={value => this.commit(PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, value, ctx)}
                />
            })
        ]);
    }

    protected renderPromptsSection(ctx: AiConfigurationRenderContext, disabled: boolean): React.ReactNode {
        return this.renderSection(this.sectionPrompts, [
            this.renderSettingRow(ctx, PREFERENCE_NAME_PROMPT_TEMPLATES, disabled, {
                below: <AiPathInput
                    value={this.stringValue(PREFERENCE_NAME_PROMPT_TEMPLATES, ctx)}
                    placeholder={nls.localize('theia/ai/ide/generalConfiguration/templatesPlaceholder', 'Default: user config directory')}
                    browseLabel={nls.localizeByDefault('Browse...')}
                    disabled={disabled}
                    onCommit={value => this.commit(PREFERENCE_NAME_PROMPT_TEMPLATES, value, ctx)}
                    onBrowse={() => this.browseTemplatesFolder()}
                />
            }),
            this.renderSettingRow(ctx, PREFERENCE_NAME_MAX_RETRIES, disabled, {
                control: <AiNumberStepper
                    value={this.numberValue(PREFERENCE_NAME_MAX_RETRIES, ctx, 3)}
                    ariaLabel={this.titleFor(PREFERENCE_NAME_MAX_RETRIES)}
                    min={0}
                    max={10}
                    unit={nls.localize('theia/ai/ide/generalConfiguration/retriesUnit', 'retries')}
                    disabled={disabled}
                    onCommit={value => this.commit(PREFERENCE_NAME_MAX_RETRIES, value, ctx)}
                />
            })
        ]);
    }

    protected renderChatSection(ctx: AiConfigurationRenderContext, disabled: boolean): React.ReactNode {
        const sessionsUnit = nls.localize('theia/ai/ide/generalConfiguration/sessionsUnit', 'sessions');
        return this.renderSection(this.sectionChat, [
            this.renderSettingRow(ctx, PIN_CHAT_AGENT_PREF, disabled, {
                control: <AiToggleSwitch
                    checked={this.booleanValue(PIN_CHAT_AGENT_PREF, ctx)}
                    ariaLabel={this.titleFor(PIN_CHAT_AGENT_PREF)}
                    disabled={disabled}
                    onChange={value => this.commit(PIN_CHAT_AGENT_PREF, value, ctx)}
                />
            }),
            this.renderSettingRow(ctx, BYPASS_MODEL_REQUIREMENT_PREF, disabled, {
                control: <AiToggleSwitch
                    checked={this.booleanValue(BYPASS_MODEL_REQUIREMENT_PREF, ctx)}
                    ariaLabel={this.titleFor(BYPASS_MODEL_REQUIREMENT_PREF)}
                    disabled={disabled}
                    onChange={value => this.commit(BYPASS_MODEL_REQUIREMENT_PREF, value, ctx)}
                />
            }),
            this.renderSettingRow(ctx, PERSISTED_SESSION_LIMIT_PREF, disabled, {
                control: <AiSessionLimitControl
                    value={this.numberValue(PERSISTED_SESSION_LIMIT_PREF, ctx, 25)}
                    limitedLabel={nls.localizeByDefault('Limited')}
                    limitedDefault={25}
                    limitedMin={1}
                    limitedMax={999}
                    unit={sessionsUnit}
                    specials={[
                        { value: -1, label: nls.localize('theia/ai/ide/generalConfiguration/unlimited', 'Unlimited') },
                        { value: 0, label: nls.localize('theia/ai/ide/generalConfiguration/dontPersist', "Don't persist") }
                    ]}
                    ariaLabel={this.titleFor(PERSISTED_SESSION_LIMIT_PREF)}
                    disabled={disabled}
                    onCommit={value => this.commit(PERSISTED_SESSION_LIMIT_PREF, value, ctx)}
                />
            }),
            this.renderSettingRow(ctx, WELCOME_SCREEN_SESSIONS_PREF, disabled, {
                control: <AiSessionLimitControl
                    value={this.numberValue(WELCOME_SCREEN_SESSIONS_PREF, ctx, 20)}
                    limitedLabel={nls.localizeByDefault('Limited')}
                    limitedDefault={20}
                    limitedMin={1}
                    limitedMax={99}
                    unit={sessionsUnit}
                    specials={[
                        { value: 0, label: nls.localize('theia/ai/ide/generalConfiguration/hideList', 'Hide list') }
                    ]}
                    ariaLabel={this.titleFor(WELCOME_SCREEN_SESSIONS_PREF)}
                    disabled={disabled}
                    onCommit={value => this.commit(WELCOME_SCREEN_SESSIONS_PREF, value, ctx)}
                />
            }),
            this.renderSettingRow(ctx, SESSION_STORAGE_PREF, disabled, {
                control: <AiEnumSelect
                    value={this.selectValue(SESSION_STORAGE_PREF, ctx)}
                    options={this.enumOptions(SESSION_STORAGE_PREF)}
                    ariaLabel={this.titleFor(SESSION_STORAGE_PREF)}
                    disabled={disabled}
                    onCommit={value => this.commit(SESSION_STORAGE_PREF, value, ctx)}
                />
            })
        ]);
    }

    protected renderNotificationsSection(ctx: AiConfigurationRenderContext, disabled: boolean): React.ReactNode {
        return this.renderSection(this.sectionNotifications, [
            this.renderSettingRow(ctx, PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE, disabled, {
                control: <AiEnumSelect
                    value={this.selectValue(PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE, ctx)}
                    options={this.enumOptions(PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE)}
                    ariaLabel={this.titleFor(PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE)}
                    disabled={disabled}
                    onCommit={value => this.commit(PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE, value, ctx)}
                />
            })
        ]);
    }

    protected renderSection(title: string, rows: React.ReactNode[]): React.ReactNode {
        return <div className='ai-general-section' key={title}>
            <h2 className='ai-general-section-title'>{title}</h2>
            {rows}
        </div>;
    }

    /**
     * Renders one setting row: title with the real preference id, the schema description, a control
     * (inline via {@link options.control} or full-width via {@link options.below}), and — when the
     * value is overridden in the current scope — a modified edge and a hover reset that clears the override.
     */
    protected renderSettingRow(
        ctx: AiConfigurationRenderContext,
        preferenceId: string,
        disabled: boolean,
        options: { control?: React.ReactNode; below?: React.ReactNode }
    ): React.ReactNode {
        const inspection = this.settingsRowService.inspect(preferenceId, ctx.scope);
        const description = this.settingsRowService.describe(preferenceId).description;
        return <div
            className={`ai-general-setting${inspection.modified ? ' modified' : ''}`}
            key={preferenceId}
            data-ai-config-row-id={preferenceId}
        >
            <div className='ai-general-setting-top'>
                <div className='ai-general-setting-main'>
                    <div className='ai-general-setting-title'>
                        {this.titleFor(preferenceId)}
                        <span className='ai-general-setting-id'>{preferenceId}</span>
                    </div>
                    {description && <AiMarkdownDescription renderMarkdown={this.renderMarkdown} markdown={description} />}
                </div>
                <div className='ai-general-setting-ctrl'>
                    {inspection.modified && <button
                        type='button'
                        className='ai-general-reset'
                        title={nls.localizeByDefault('Reset Setting')}
                        disabled={disabled}
                        onClick={() => this.resetPref(preferenceId, ctx)}
                    >
                        <span className={codicon('discard')}></span>
                        {nls.localizeByDefault('Reset')}
                    </button>}
                    {options.control}
                </div>
            </div>
            {options.below && <div className='ai-general-setting-below'>{options.below}</div>}
        </div>;
    }

    protected async browseTemplatesFolder(): Promise<string | undefined> {
        const selection = await this.fileDialogService.showOpenDialog({
            title: nls.localizeByDefault('Select Folder'),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });
        if (!selection) {
            return undefined;
        }
        const uri: URI | undefined = Array.isArray(selection) ? selection[0] : selection;
        return uri?.path.fsPath();
    }

    protected commit(preferenceId: string, value: unknown, ctx: AiConfigurationRenderContext): void {
        this.settingsRowService.set(preferenceId, value, ctx.scope).then(() => ctx.update());
    }

    protected resetPref(preferenceId: string, ctx: AiConfigurationRenderContext): void {
        this.settingsRowService.reset(preferenceId, ctx.scope).then(() => ctx.update());
    }

    protected booleanValue(preferenceId: string, ctx: AiConfigurationRenderContext): boolean {
        return this.settingsRowService.inspect(preferenceId, ctx.scope).value === true;
    }

    protected numberValue(preferenceId: string, ctx: AiConfigurationRenderContext, fallback: number): number {
        const value = this.settingsRowService.inspect(preferenceId, ctx.scope).value;
        return typeof value === 'number' ? value : fallback;
    }

    protected stringValue(preferenceId: string, ctx: AiConfigurationRenderContext): string {
        const value = this.settingsRowService.inspect(preferenceId, ctx.scope).value;
        return typeof value === 'string' ? value : '';
    }

    protected selectValue(preferenceId: string, ctx: AiConfigurationRenderContext): string | undefined {
        const value = this.settingsRowService.inspect(preferenceId, ctx.scope).value;
        return value === undefined ? undefined : String(value);
    }

    protected arrayValue(preferenceId: string, ctx: AiConfigurationRenderContext): string[] {
        const value = this.settingsRowService.inspect(preferenceId, ctx.scope).value;
        return Array.isArray(value) ? value.map(String) : [];
    }

    protected enumOptions(preferenceId: string): { value: string; label: string }[] {
        return this.settingsRowService.enumOptions(preferenceId).map(option => {
            const value = option.value ?? '';
            return { value, label: option.label ?? value };
        });
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const settingLabel = nls.localizeByDefault('Setting');
        const items = this.getSectionRefs().map(ref => ({
            label: this.titleFor(ref.preferenceId),
            typeLabel: settingLabel,
            categoryId: this.id,
            target: { categoryId: this.id, highlight: { rowId: ref.preferenceId } },
            keywords: `${ref.preferenceId} ${ref.section}`
        } satisfies AiConfigurationSearchItem));
        // Include the master enablement toggle (rendered in the hero rather than a section).
        items.unshift({
            label: this.titleFor(PREFERENCE_NAME_ENABLE_AI),
            typeLabel: settingLabel,
            categoryId: this.id,
            target: { categoryId: this.id, highlight: { rowId: PREFERENCE_NAME_ENABLE_AI } },
            keywords: `${PREFERENCE_NAME_ENABLE_AI} ${this.sectionAgents}`
        });
        return items;
    }
}
