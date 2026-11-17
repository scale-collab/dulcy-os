import ReactDOM from 'react-dom';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import './build.css';

// Extend the Window interface to include our custom properties
declare global {
    interface Window {
        _airtableReact: typeof React;
        _airtableReactDOM: typeof ReactDOM;
        _airtableReactDOMServer: typeof ReactDOMServer;
        _airtableBlockCodeVersion: string | null | undefined;
        _airtableBlockSdkVersion: string | null | undefined;
        _airtableRunBlock: () => Promise<void>;
    }
}

declare const process: {
    env: {
        CODE_VERSION: string | null | undefined;
        BLOCK_SDK_VERSION: string | null | undefined;
    };
};

window['_airtableReact'] = React;
window['_airtableReactDOM'] = ReactDOM;
window['_airtableReactDOMServer'] = ReactDOMServer;
window['_airtableBlockCodeVersion'] = process.env.CODE_VERSION;
window['_airtableBlockSdkVersion'] = process.env.BLOCK_SDK_VERSION;
let didRun = false;
window['_airtableRunBlock'] = async function runBlock() {
    if (didRun) {
        console.log('Refusing to re-run block');
        return;
    }
    didRun = true;
    // Requiring the entry point file runs user code. Be sure to do any setup
    // above this line.
    // @ts-expect-error ./source.tsx does not exist at build time
    await import('./source.tsx');
};
