'use strict';

/**
 * Application ports (interfaces).
 *
 * These are the boundaries the application depends on. Infrastructure implements
 * them; tests can replace them with fakes. In TypeScript these become interfaces.
 */

/**
 * @typedef {Object} ReceiverGateway
 * @property {(settings: {ip:string,port:string,selectedListName:string}) => Promise<{channels:Array<{name:string,url:string}>,selectedListName:string,availableLists:string[],detectedModel:'STC'|'S'|'S1'|'S2'|'S_SERIES'}>} fetchChannels
 * @property {() => void} close
 */

/**
 * @typedef {Object} ConfigRepository
 * @property {() => any} read
 * @property {(data: any) => void} write
 * @property {() => void} ensureDataDir
 */

/**
 * @typedef {Object} Scheduler
 * @property {(expr: string) => boolean} validate
 * @property {(expr: string, fn: () => void) => {stop:()=>void,destroy?:()=>void}} schedule
 */

/**
 * @typedef {Object} Clock
 * @property {() => Date} now
 */

/**
 * @typedef {Object} Logger
 * @property {(...args: any[]) => void} info
 * @property {(...args: any[]) => void} warn
 * @property {(...args: any[]) => void} error
 */

export {};
