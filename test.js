/**
 * Copyright 2019, Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 'use strict';

// const assert = require('assert');

// describe('cloud functions gmail', () => {
//   it('should have tests', () => {
//     assert.ok(true);
//   });
// });


const {oauth2callback} = require('./index');

oauth2callback({ query: { code: "4/0AX4XfWjslfPRhu7EBE_Xtz_52PbUlTt11YHoluo9OrXiBtjx4FqZ0gnV2e849Yj6G8eFEw"}}, {});