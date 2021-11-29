import {ShopifyServerProvider, DefaultRoutes} from '@shopify/hydrogen';
import {Suspense} from 'react';

import shopifyConfig from '../shopify.config';

import DefaultSeo from './components/DefaultSeo.server';
import NotFound from './components/NotFound.server';
import CartProvider from './components/CartProvider.client';
import LoadingFallback from './components/LoadingFallback';

export default function App({...serverState}) {
  const pages = import.meta.globEager('./pages/**/*.server.[jt]sx');

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ShopifyServerProvider shopifyConfig={shopifyConfig} {...serverState}>
        <CartProvider>
          <DefaultSeo />
          <DefaultRoutes
            location={{
              pathname: serverState.pathname,
              search: serverState.search,
            }}
            pages={pages}
            serverState={serverState}
            fallback={<NotFound />}
          />
        </CartProvider>
      </ShopifyServerProvider>
    </Suspense>
  );
}
