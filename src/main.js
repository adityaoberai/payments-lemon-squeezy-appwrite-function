import AppwriteService from './appwrite.js';
import { getStaticFile, interpolate, throwIfMissing } from './utils.js';
import LemonSqueezyService from './lemonsqueezy.js';

export default async (context) => {
  const { req, res, log, error } = context;

  throwIfMissing(process.env, [
    'LEMON_SQUEEZY_API_KEY',
    'LEMON_SQUEEZY_WEBHOOK_SECRET',
    'APPWRITE_API_KEY',
    'LEMON_SQUEEZY_STORE_ID',
    'LEMON_SQUEEZY_VARIANT_ID'
  ]);

  const databaseId = process.env.APPWRITE_DATABASE_ID ?? 'orders';
  const collectionId = process.env.APPWRITE_COLLECTION_ID ?? 'orders';

  if (req.method === 'GET') {
    const html = interpolate(getStaticFile('index.html'), {
      APPWRITE_ENDPOINT:
        process.env.APPWRITE_ENDPOINT ?? 'https://cloud.appwrite.io/v1',
      APPWRITE_FUNCTION_PROJECT_ID: process.env.APPWRITE_FUNCTION_PROJECT_ID,
      APPWRITE_FUNCTION_ID: process.env.APPWRITE_FUNCTION_ID,
      APPWRITE_DATABASE_ID: databaseId,
      APPWRITE_COLLECTION_ID: collectionId,
    });

    return res.send(html, 200, { 'Content-Type': 'text/html; charset=utf-8' });
  }

  const appwrite = new AppwriteService();
  const lemonsqueezy = new LemonSqueezyService();

  switch (req.path) {
    case '/checkout':
      const fallbackUrl = req.scheme + '://' + req.headers['host'] + '/';

      const failureUrl = req.body?.failureUrl ?? fallbackUrl;

      var userEmail = req.body?.email;
      var userName = req.body?.name;

      var userId = req.headers['x-appwrite-user-id'];
      if (!userId) {
        error('User ID not found in request.');
        return res.redirect(failureUrl, 303);
      }

      var checkout = await lemonsqueezy.createCheckout(context, userId, userEmail, userName);
      if (!checkout) {
        error('Failed to create Lemon Squeezy checkout.');
        return res.redirect(failureUrl, 303);
      }

      log('Checkout:');
      log(checkout);

      log(`Created Lemon Squeezy checkout for user ${userId}.`);
      return res.redirect(checkout.data.data.attributes.url, 303);

    case '/webhook':
      var validRequest = lemonsqueezy.validateWebhook(context);
      if (!validRequest) {
        return res.json({ success: false }, 401);
      }

      log("Webhook request is valid.");

      var order = req.body;

      log(order);

      var userId = order.meta.custom_data.user_id;
      var orderId = order.data.id;

      await appwrite.createOrder(databaseId, collectionId, userId, orderId);
      log(
        `Created order document for user ${userId} with Lemon Squeezy order ID ${orderId}`
      );
      return res.json({ success: true });

    default:
      return res.send('Not Found', 404);
  }
};
