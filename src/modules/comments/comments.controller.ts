import { Controller, Get, Post, Body, Patch, Param, Delete, Req, Query } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { getUser } from 'src/common/utils/user';
import { Request } from 'express';
import { IGetCommentParams } from './comments.service.i';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) { }

  @Post()
  findAll(@Req() req: Request, @Query('hide') hideCmt: number, @Body() body: IGetCommentParams) {
    const user = getUser(req);
    return this.commentsService.findAll(user, !!Number(hideCmt), body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCommentDto: UpdateCommentDto) {
    return this.commentsService.update(+id, updateCommentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.commentsService.remove(+id);
  }

  @Post('/hide-cmt/:cmtId')
  hideCmt(@Req() req: Request, @Param('cmtId') cmtId: string) {
    const user = getUser(req);

    return this.commentsService.hideCmt(cmtId, user.id)
  }
}
