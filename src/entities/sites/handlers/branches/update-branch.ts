import { Request, Response } from 'express';
import { branchExistsGuard } from '../../guards/branch-exists-guard';
import { object, string } from 'joi';
import { STRING_MAX_LENGTH } from '../../../../constants';
import { emitEvent } from '../../../../events/emit-event';
import { EventType } from '../../../../events/event-type';
import { wrapAsyncMiddleware } from '../../../../commons/utils/wrap-async-middleware';
import { body } from '../../../../commons/express-joi/body';
import { BadRequestError } from '../../../../commons/errors/bad-request-error';
import { canAdminSiteGuard } from '../../guards/can-admin-site-guard';
import { Sites } from '../../site';
import { serializeBranch } from '../../serialize-branch';
import { configureSiteBranchInCaddy } from '../../../../caddy/configuration';
import { Logger } from '../../../../commons/logger/logger';

async function releaseExists(siteId: string, branchId: string): Promise<boolean> {
  const count = await Sites().countDocuments({
    _id: siteId,
    'branches._id': branchId,
  }, {
    limit: 1,
  });
  return count === 1;
}

const validators = [
  body(object({
    release: string().optional().max(STRING_MAX_LENGTH),
  })),
];

const logger = new Logger('meli.api:updateBranch');

async function handler(req: Request, res: Response): Promise<void> {
  const { siteId, branchId } = req.params;

  const releaseBranchExists = await releaseExists(siteId, req.body.mainBranch);
  if (!releaseBranchExists) {
    throw new BadRequestError('Release not found');
  }

  await Sites().updateOne({
    _id: siteId,
    'branches._id': branchId,
  }, {
    $set: {
      'branches.$.release': req.body.release,
    },
  });

  const site = await Sites().findOne({
    _id: siteId,
  });
  const branch = site.branches.find(brch => brch._id === branchId);

  configureSiteBranchInCaddy(site, branch).catch(err => {
    logger.error(err);
  });

  emitEvent(EventType.site_updated, {
    site,
  });

  res.json(serializeBranch(site, branch));
}

export const updateBranch = [
  ...branchExistsGuard,
  ...canAdminSiteGuard,
  ...validators,
  wrapAsyncMiddleware(handler),
];
