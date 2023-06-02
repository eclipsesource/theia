/**
 * Generated using theia-extension-generator
 */
import { TestExtensionCommandContribution, TestExtensionMenuContribution } from './test-extension-contribution';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';

export default new ContainerModule(bind => {
    // add your contribution bindings here
    bind(CommandContribution).to(TestExtensionCommandContribution);
    bind(MenuContribution).to(TestExtensionMenuContribution);
});
