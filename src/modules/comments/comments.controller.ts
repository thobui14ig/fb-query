import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { getUser } from 'src/common/utils/user';
import { CommentsService } from './comments.service';
import { IGetCommentParams } from './comments.service.i';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentEntity } from './entities/comment.entity';

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

  @Post('/hide-cmt')
  hideCmt(@Body() body: CommentEntity) {
    return this.commentsService.hideCmt(body)
  }
}
