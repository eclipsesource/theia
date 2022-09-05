/* eslint-disable @typescript-eslint/no-explicit-any */
// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { RpcTestService } from '../common/rpc-test-service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
@injectable()
export class RpcTestServiceImpl implements RpcTestService {
    private _smallObject: any;
    private _mediumObject: any;
    private _largetObject: any;
    private _binaryBuffer: Uint8Array;
    private _largeString: string;
    private _multipleMediumStrings: string[];

    @postConstruct()
    postConstruct(): void {
        this._smallObject = { some: 'small', plain: 'object', id: 5 };
        const entry = {
            a: 'b', b: 5, c: 1.4, d: false, e: [{
                a: 'nestedA',
                b: 'nestedB'
            }, 'someString', 6], f: {
                some: 'key'
            }
        };
        this._mediumObject = [{ ...entry }, { ...entry }, { ...entry }, { ...entry }, { ...entry }, { ...entry }];
        this._binaryBuffer = fs.readFileSync(path.resolve(__dirname, '../../resources/getDeployedPlugins.json'));
        this._largetObject = JSON.parse(this._binaryBuffer.toString());
        this._largeString = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../resources/test.json')).toString());
        this._multipleMediumStrings = [];
        for (let i = 0; i < 100; i++) {
            this._multipleMediumStrings.push(crypto.randomBytes(10000).toString('hex'));
        }
    }
    async smallObject(): Promise<any> {
        return this._smallObject;
    }

    async mediumObject(): Promise<any> {
        return this._mediumObject;
    }

    async largeObject(): Promise<any> {
        return this._largetObject;
    }

    async binaryBuffer(): Promise<Uint8Array> {
        return this._binaryBuffer;
    }

    async largeString(): Promise<string> {
        return this._largeString;
    }

    async multipleMediumStrings(): Promise<string[]> {
        return this._multipleMediumStrings;
    }
}

