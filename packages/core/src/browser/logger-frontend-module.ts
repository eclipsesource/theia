// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { ContainerModule, Container } from 'inversify';
import { ILoggerServer, ILoggerClient, LogLevel } from '../common/logger-protocol';
import { ILogger, Logger, LoggerFactory, setRootLogger, LoggerName, rootLoggerName } from '../common/logger';
import { LoggerWatcher } from '../common/logger-watcher';
import { FrontendApplicationContribution } from './frontend-application';

export const loggerFrontendModule = new ContainerModule(bind => {
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        initialize(): void {
            setRootLogger(ctx.container.get<ILogger>(ILogger));
        }
    }));

    bind(LoggerName).toConstantValue(rootLoggerName);
    bind(ILogger).to(Logger).inSingletonScope().whenTargetIsDefault();
    bind(LoggerWatcher).toSelf().inSingletonScope();
    const logger: ILoggerServer = {
        setLogLevel: async (_name: string, _logLevel: number): Promise<void> => { },
        getLogLevel: async (_name: string): Promise<number> => LogLevel.ERROR,
        log: async (_name: string, _logLevel: number, message: unknown, _params: unknown[]): Promise<void> => {
            console.log(message);
        },
        child: async (_name: string): Promise<void> => { },
        dispose: (): void => {
        },
        setClient: (_client: ILoggerClient | undefined): void => {
        }
    };
    bind(ILoggerServer).toConstantValue(logger);
    bind(LoggerFactory).toFactory(ctx =>
        (name: string) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(ILogger).to(Logger).inTransientScope();
            child.bind(LoggerName).toConstantValue(name);
            return child.get(ILogger);
        }
    );
});
